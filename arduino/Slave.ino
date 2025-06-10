#include <Wire.h>

#define I2C_ADDRESS 0x08 // I2C address for the slave
#define BUFFER_SIZE 30   // Max data chunk size (leave room for null terminator)

String carData = "1|Toyota|Camry|Black|2020#2|Empty#3|Chevrolet|Camaro|Yellow|2012|";
int dataLength = 0;
int currentPosition = 0;
bool dataSent = false; // Flag to track if data has been sent

void setup() {
  Wire.begin(I2C_ADDRESS); // Initialize I2C as slave
  Wire.onRequest(requestEvent); // Register event for data request
  Serial.begin(115200);
  dataLength = carData.length();
  Serial.println("I2C Slave ready");
}

void loop() {
  // No reset logic needed; data is sent only once
}

// Function called when master requests data
void requestEvent() {
  if (dataSent) {
    // If data has already been sent, send empty string
    Wire.write("");
    Serial.println("Data already sent, sending empty chunk");
    return;
  }

  // Calculate how much data to send (up to BUFFER_SIZE)
  int remaining = dataLength - currentPosition;
  int toSend = min(remaining, BUFFER_SIZE);
  
  if (toSend > 0) {
    // Extract substring
    String chunk = carData.substring(currentPosition, currentPosition + toSend);
    Wire.write(chunk.c_str(), chunk.length());
    Serial.print("Sent chunk: ");
    Serial.println(chunk);
    currentPosition += toSend;
  } else {
    // Send empty string to indicate end and mark data as sent
    Wire.write("");
    Serial.println("Sent empty chunk (end)");
    dataSent = true; // Mark transmission complete
  }
}