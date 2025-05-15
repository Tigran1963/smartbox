#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// #define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
// #define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

#define SERVICE_UUID        "1111"
#define CHARACTERISTIC_UUID "2222"

BLEServer *pServer;
BLEService *pService;
BLECharacteristic *pCharacteristic;

String receivedData = "";

class MyServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    Serial.println("Устройство подключено");
  };

  void onDisconnect(BLEServer* pServer) {
    Serial.println("Устройство отключено");
    pServer->startAdvertising();
  }
};

class MyCallbacks: public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    receivedData = pCharacteristic->getValue();
    if (receivedData.length() > 0) {
      Serial.println("Получены данные:");
      Serial.println(receivedData);
    }
  }
};

void setup() {
  Serial.begin(115200);
  Serial.println("Запуск BLE сервера...");

  // Инициализация BLE с именем
  BLEDevice::init("ESP32SB");
  
  // Настройка безопасности BLE (добавлено)
  BLESecurity *pSecurity = new BLESecurity();
  pSecurity->setAuthenticationMode(ESP_LE_AUTH_BOND); // Режим аутентификации
  pSecurity->setCapability(ESP_IO_CAP_NONE);         // Не требует ввода PIN
  pSecurity->setInitEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK);

  // Создание сервера и сервиса
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  
  pService = pServer->createService(SERVICE_UUID);
  
  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_NOTIFY
  );
  
  pCharacteristic->setCallbacks(new MyCallbacks());
  pCharacteristic->addDescriptor(new BLE2902());
  pCharacteristic->setValue("{\"status\":\"ready\"}");
  
  pService->start();

  // Настройка рекламы
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  BLEDevice::startAdvertising();

  Serial.println("Сервер запущен. Подключитесь через BLE без PIN!");
}

void loop() {
  delay(1000);
}