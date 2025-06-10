#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <Wire.h>
#include <string.h>

#define I2C_ADDRESS 0x08 // Must match slave address
#define BUFFER_SIZE 30   // Must match slave's buffer size

struct Box{
  int id;
  struct Car{
    String brand = "";
    String model = "";
    String color = "";
    int year = 0;
  }car;
  bool empty;
  String UID = "";
};

// BLE SECTION
BLEServer *pServer = NULL;
String receivedData = "";
BLECharacteristic *message_characteristic = NULL;
BLECharacteristic *box_characteristic = NULL;
bool checkConnection = false;
String boxValue = "0";

#define SERVICE_UUID "1111"
#define MESSAGE_CHARACTERISTIC_UUID "2222"
#define BOX_CHARACTERISTIC_UUID "3333"

String receiveI2CData() {
  String i2cData = "";
  bool done = false;

  while (!done) {
    Wire.requestFrom(I2C_ADDRESS, BUFFER_SIZE); // Request chunk
    String chunk = "";
    while (Wire.available()) {
      char c = Wire.read();
      chunk += c;
    }
    
    if (chunk.length() == 0) {
      done = true; // Empty chunk indicates end
    } else {
      i2cData += chunk;
      Serial.print("Received chunk: ");
      Serial.println(chunk);
      delay(10); // Small delay to allow slave to prepare next chunk
    }
  }

  return i2cData;
}

void sentFirstData() {
  // Get data from I2C slave
  String i2cData = receiveI2CData();
  
  if (i2cData.length() > 0) {
    for (int i = 0; i < 1; ++i) {
      message_characteristic->setValue(i2cData.c_str());
      message_characteristic->notify();
      Serial.print("Sent via BLE: ");
      Serial.println(i2cData);
      delay(100);
    }
  } else {
    Serial.println("No data received from I2C slave");
  }
}

class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) {
    Serial.println("Connected");
    checkConnection = true;
  };

  void onDisconnect(BLEServer *pServer) {
    Serial.println("Disconnected");
    checkConnection = false;
    pServer->getAdvertising()->start();
    Serial.println("Advertising restarted");
  }
};

class CharacteristicsCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    Serial.print("Received: ");
    Serial.println(pCharacteristic->getValue().c_str());
    
    if (pCharacteristic == box_characteristic) {
      boxValue = pCharacteristic->getValue().c_str();
      box_characteristic->setValue(const_cast<char *>(boxValue.c_str()));
      box_characteristic->notify();
    }
  }
};

void setup() {
  Serial.begin(115200);
  Wire.begin(); // Initialize I2C as master

  // Initialize BLE
  BLEDevice::init("ESP32SB");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService *pService = pServer->createService(SERVICE_UUID);
  delay(100);

  // Create BLE characteristics
  message_characteristic = pService->createCharacteristic(
      MESSAGE_CHARACTERISTIC_UUID,
      BLECharacteristic::PROPERTY_READ |
      BLECharacteristic::PROPERTY_WRITE |
      BLECharacteristic::PROPERTY_NOTIFY |
      BLECharacteristic::PROPERTY_INDICATE);

  box_characteristic = pService->createCharacteristic(
      BOX_CHARACTERISTIC_UUID,
      BLECharacteristic::PROPERTY_READ |
      BLECharacteristic::PROPERTY_WRITE |
      BLECharacteristic::PROPERTY_NOTIFY |
      BLECharacteristic::PROPERTY_INDICATE);

  // Start BLE service
  pService->start();
  pServer->getAdvertising()->start();

  message_characteristic->setCallbacks(new CharacteristicsCallbacks());
  box_characteristic->setCallbacks(new CharacteristicsCallbacks());

  Serial.println("Waiting for a client connection to notify...");
}

void loop() {
  if (checkConnection) {
    sentFirstData();
    checkConnection = false;
  }
}