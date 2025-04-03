import { app, ipcMain } from 'electron';
import path from 'node:path'
import os from 'node:os'
const ffi = require('ffi-napi');
const DLL_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'dlls', os.arch() === 'x64' ? 'x64' : 'x86', 'TSCLIB.dll')
    : path.join(app.getAppPath(), 'dlls', os.arch() === 'x64' ? 'x64' : 'x86', 'TSCLIB.dll');
// 定义打印机 DLL 接口
const printerLib = ffi.Library(DLL_PATH, {
    'openport': ['int', ['string']],
    'closeport': ['int', []],

    'setup': ['int', ['string', 'string', 'string', 'string', 'string', 'string', 'string']],
    'clearbuffer': ['int', []],
    'barcode': ['int', ['string', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string']],
    'sendcommand': ['int', ['string']],
    'printlabel': ['int', ['string', 'string']],
    'formfeed': ['int', []],
    'nobackfeed': ['int', []],
    'about': ['int', []],
    'usbprintername': ['string', []],
    'usbprinterserial': ['string', []],
});

/**
 * 计算QR码参数
 * @param content 内容长度
 * @param targetSize 目标尺寸(mm)
 * @returns QR码参数
 */
function calculateQRParams(targetSize: number): {
    version: number;
    cellWidth: number;
    errorLevel: string;
    predictedSize: number;
    difference: number;
} {
    // 基准参考值（实测数据）
    const BASE = {
        size: 11,           // S8+M+cell4 = 11mm
        version: 8,         // 基准版本 S8
        cellWidth: 4,       // 基准 cellWidth
        errorLevel: 'M'     // 基准纠错等级
    };

    // 纠错等级影响因子（实测）
    const ERROR_FACTORS = {
        'M': 1,            // 基准参考
        'Q': 1.1,          // 实测 12.1/11
        'H': 1.2           // 预估值
    };

    // 内容长度决定最小版本要求
    let minVersion = 7;   // 77字母在M级别下需要S7

    // 可用的参数组合
    const combinations: any[] = [];

    // 遍历可能的组合
    for (let version = minVersion; version <= 9; version++) {
        for (let cellWidth = 3; cellWidth <= 6; cellWidth++) {
            ['M', 'Q', 'H'].forEach(level => {
                // 确保纠错等级满足数据容量
                if (level === 'M' || version > minVersion) {
                    const predictedSize = BASE.size
                        * (cellWidth / BASE.cellWidth)
                        * ERROR_FACTORS[level as keyof typeof ERROR_FACTORS];

                    combinations.push({
                        version,
                        cellWidth,
                        errorLevel: level,
                        predictedSize,
                        difference: Math.abs(predictedSize - targetSize)
                    });
                }
            });
        }
    }

    // 按照与目标尺寸的差异排序
    combinations.sort((a, b) => a.difference - b.difference);

    // 返回最佳匹配
    const best = combinations[0];

    return best;
}
// 设置 IPC 通信处理器
export function setupPrinterHandlers() {
    // 打开打印机
    ipcMain.handle('printer:open', async (_, portName: string) => {
        try {
            const result = printerLib.openport(portName);
            console.log(result, '< --- result openport --->')
            return { success: result === 1, error: null };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('printer:getUSBPrinterName', async () => {
        try {
            const result = printerLib.usbprintername();
            console.log(result, '< --- result --->')
            return { success: true, printerName: result };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    // 打印二维码
    ipcMain.handle('printer:printQrcode', async (_, options: any) => {
        try {
            const {
                qrContent,
                labelWidth = 60,            // 标签宽度(mm)
                labelHeight = 40,
                qrSize = 12,        // 二维码尺寸(mm)
            } = options;
            // 清除缓冲区
            // 计算每毫米的点数
            const qrParams = calculateQRParams(qrSize);
            const dotsPerMm = 12;
            // const cellWidth = getBestCellWidth(qrContent, qrSize);
            const cellWidth = 3
            console.log(cellWidth, '< --- cellWidth --->')
            // 计算二维码在标签左上角的位置（考虑1mm边距）
            const xPos = Math.round(1 * dotsPerMm);
            const yPos = Math.round(1 * dotsPerMm);
            console.log(xPos, yPos, '< --- xPos, yPos --->')
            // 清除缓冲区
            printerLib.clearbuffer();

            // 初始化标签设置
            const commands = [
                `SIZE ${labelWidth + 2.6} mm, ${labelHeight} mm`,
                'GAP 2 mm, 0 mm',
                'SET MARGIN 0',
                'DIRECTION 1',
                'CLS',
                'DENSITY 15',
                'REFERENCE 0,0',
                'OFFSET 0',
                'SPEED 1.0',
                `QRCODE ${2},${yPos},${qrParams.errorLevel},${qrParams.cellWidth},H,0,M2,S${qrParams.version},"${qrContent}"`,
                // `QRCODE ${400},${yPos},H,${'4'},H,0,M2,"${qrContent}"`,
                // // 在标签左上角打印二维码，考虑1mm的边距
                // `QRCODE ${2},${yPos},Q,${'4'},H,0,M2,"${qrContent}"`,
                // 打印标签
                'PRINT 1, 1'
            ]

            // 发送命令
            const commandString = commands.join('\r\n');
            console.log('Commands:', commandString);
            const sendResult = printerLib.sendcommand(commandString);
            console.log('Send command result:', sendResult);

            return {
                success: true,
                error: null
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    // 关闭打印机
    ipcMain.handle('printer:close', async () => {
        try {
            const result = printerLib.closeport();
            return { success: result === 0, error: null };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

} 