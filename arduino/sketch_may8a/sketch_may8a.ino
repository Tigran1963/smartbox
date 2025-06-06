#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <string.h>


struct Car{
  int id;
  String brand;
  String model;
  String color;
  int year;
};

// BLE SECTION
BLEServer *pServer = NULL;

String receivedData = "";

BLECharacteristic *message_characteristic = NULL;
BLECharacteristic *box_characteristic = NULL;

String boxValue = "0";
// See the following for generating UUIDs:
// https://www.uuidgenerator.net/

#define SERVICE_UUID "1111"

#define MESSAGE_CHARACTERISTIC_UUID "2222"
#define BOX_CHARACTERISTIC_UUID "3333"

class MyServerCallbacks : public BLEServerCallbacks{
  void onConnect(BLEServer *pServer)
  {
    Serial.println("Connected");
  };

  void onDisconnect(BLEServer *pServer)
  {
    Serial.println("Disconnected");
  }
};

class CharacteristicsCallbacks : public BLECharacteristicCallbacks{
  void onWrite(BLECharacteristic *pCharacteristic)
  {
    Serial.print("Value Written ");
    Serial.println(pCharacteristic->getValue().c_str());

    if (pCharacteristic == box_characteristic)
    {
      boxValue = pCharacteristic->getValue().c_str();
      box_characteristic->setValue(const_cast<char *>(boxValue.c_str()));
      box_characteristic->notify();
    }
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

void setup(){
  Serial.begin(115200);

  // Create the BLE Device
  BLEDevice::init("ESP32SB");
  // Create the BLE Server
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  // Create the BLE Service
  BLEService *pService = pServer->createService(SERVICE_UUID);
  delay(100);

  // Create a BLE Characteristic//
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

  // Start the BLE service//
  pService->start();

  // Start advertising//
  pServer->getAdvertising()->start();

  // message_characteristic->setValue("EBANA BLYA");
  message_characteristic->setCallbacks(new CharacteristicsCallbacks());

  // box_characteristic->setValue("0");
  box_characteristic->setCallbacks(new CharacteristicsCallbacks());

  Serial.println("Waiting for a client connection to notify...");
}
String carData[] = {
  "1|Toyota|Camry|Black|2020#2|Empty",
  "1|BMW|X5|White|2021#2|Tesla|Model3|Red|2019",
  "1|Honda|Civic|Blue|2018#2|Lada|Vesta|Grey|2022",
  "1|Empty#2|Toyota|Corolla|Silver|2017"
};

int currentIndex = 0;
const int totalMessages = sizeof(carData) / sizeof(carData[0]);

void loop() {
  String stepData = carData[currentIndex];
  message_characteristic->setValue(stepData.c_str());
  message_characteristic->notify();
  Serial.println(stepData);

  currentIndex = (currentIndex + 1) % totalMessages; // Переключение на следующее сообщение
  delay(20000);
}