import { useRef, useState } from 'react'
import { QRCode, Button, message, Steps, Input, Space, Modal, InputNumber, Select } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import type { InputRef } from 'antd/lib/input';
import './App.css'

function App() {
  const qrRef = useRef(null);
  const inputTimerRef = useRef<NodeJS.Timeout | null>(null);
  const productInputRef = useRef<InputRef>(null);
  const deviceInputRef = useRef<InputRef>(null);
  const [current, setCurrent] = useState(0);
  const [productQRCode, setProductQRCode] = useState('');
  const [matching, setMatching] = useState(false);
  const [printSettings, setPrintSettings] = useState({
    width: 60,  // 默认标签宽度 (mm)
    height: 40, // 默认标签高度 (mm)
    qrSize: 12, // 默认二维码尺寸 (mm)
  });
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  const printQRCode = async (qrContent: string) => {
    try {
      // 打开打印机
      const openResult = await window.ipcRenderer.invoke('printer:open', 'USB')
      if (!openResult.success) {
        message.error('打开打印机失败')
        return
      }
      // 重置流程
      resetScanProcess();
      // 打印二维码
      await window.ipcRenderer.invoke('printer:printQrcode', {
        qrContent, // 使用扫描的商品码作为内容
        labelWidth: printSettings.width,   // 使用设置的标签宽度 (mm)
        labelHeight: printSettings.height,  // 使用设置的标签高度 (mm)
        qrSize: printSettings.qrSize, // 使用设置的二维码尺寸 (mm)
      })
      message.success('打印成功');
    } catch (error) {
      console.error('打印失败:', error);
      message.error('打印失败')
    }
  }

  // 新增函数
  const handleProductQRScan = (value: string) => {
    if (value) {
      setProductQRCode(value);
      message.success('商品码扫描成功');
      setCurrent(1); // 进入下一步
    }
  };

  const handleDeviceQRScan = (value: string) => {
    if (value) {
      // 检查两个二维码是否匹配
      if (value === productQRCode) {
        message.success('二维码匹配成功！');
        setMatching(true);
        printQRCode(value);
      } else {
        message.error('二维码不匹配，请重新扫描');
        if (deviceInputRef.current && deviceInputRef.current.input) {
          deviceInputRef.current.input.value = ''
        }
      }
    }
  };

  const resetScanProcess = () => {
    setCurrent(0);
    setProductQRCode('');
    setMatching(false);

  };


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const value = e.target.value;
    if (inputTimerRef.current) {
      clearTimeout(inputTimerRef.current);
    }

    inputTimerRef.current = setTimeout(() => {
      if (value.length > 8) {
        const cleanValue = value.trim()
        if (type === 'product') {
          handleProductQRScan(cleanValue)
        } else {
          handleDeviceQRScan(cleanValue)
        }
      }
      if (type === 'product') {
        if (productInputRef.current && productInputRef.current.input) {
          productInputRef.current.input.value = ''
        }
      } else {
        if (deviceInputRef.current && deviceInputRef.current.input) {
          deviceInputRef.current.input.value = ''
        }
        // 清除计时器
        inputTimerRef.current = null
      }
    }, 20)
  };

  // 设置相关函数
  const openSettingsModal = () => {
    setSettingsModalVisible(true);
  };

  const closeSettingsModal = () => {
    setSettingsModalVisible(false);
  };

  const saveSettings = () => {
    message.success('打印设置已保存');
    closeSettingsModal();
  };

  return (
    <div className="app-container">
      <Button
        className="settings-button"
        icon={<SettingOutlined />}
        onClick={openSettingsModal}
      />

      <div className="main-content">
        <Steps
          className="scan-steps"
          current={current}
          items={[
            { title: '扫描商品码', description: '请扫描商品二维码' },
            { title: '扫描设备码', description: '请扫描设备二维码' },
          ]}
        />

        <div className="scan-content">
          {current === 0 && (
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>请扫描商品二维码</div>
              <Input
                placeholder="输入或扫描商品码"
                ref={productInputRef}
                onChange={(e) => handleInputChange(e, 'product')}
                autoFocus
                type="password"
              // onBlur={() => ()}
              />
            </Space>
          )}

          {current === 1 && (
            <Space direction="vertical" style={{ width: '100%' }}>
              <div className="product-qr-code">商品码:
                <span className="product-qr-code-text">{productQRCode}</span>
              </div>
              <div>请扫描设备二维码</div>
              <Input
                placeholder="输入或扫描设备码"
                ref={deviceInputRef}
                onChange={(e) => handleInputChange(e, 'device')}
                autoFocus
                type="password"
              />
              {matching && (
                <div>
                  <div className="qr-code-match-success">二维码匹配成功！</div>
                  <div ref={qrRef}>
                    <QRCode
                      value={productQRCode}
                      size={100}
                      errorLevel="H"
                      type="svg"
                      className="qr-code-container"
                    />
                  </div>
                </div>
              )}
            </Space>
          )}
        </div>
      </div>

      {/* 设置模态框 */}
      <Modal
        title="打印设置"
        open={settingsModalVisible}
        onOk={saveSettings}
        onCancel={closeSettingsModal}
      >
        <div className="setting-input-group">
          <div className="setting-label">二维码尺寸 (mm):</div>
          <InputNumber
            value={printSettings.qrSize}
            min={1}
            max={100}
            onChange={(value) => setPrintSettings(prev => ({ ...prev, qrSize: value || 12 }))}
            className="setting-input"
          />
        </div>
        <div className="setting-input-group">
          <div className="setting-label">标签宽度 (mm):</div>
          <InputNumber
            value={printSettings.width}
            min={1}
            max={100}
            onChange={(value) => setPrintSettings(prev => ({ ...prev, width: value || 60 }))}
            className="setting-input"
          />
        </div>
        <div className="setting-input-group">
          <div className="setting-label">标签高度 (mm):</div>
          <InputNumber
            value={printSettings.height}
            min={1}
            max={100}
            onChange={(value) => setPrintSettings(prev => ({ ...prev, height: value || 40 }))}
            className="setting-input"
          />
        </div>
      </Modal>
    </div>
  )
}

export default App