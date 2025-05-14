import React, {
	useState,
	useEffect,
	createContext,
	useContext,
	useCallback
} from "react";
import {
	View,
	Text,
	FlatList,
	StyleSheet,
	TextInput,
	TouchableOpacity,
	Modal,
	Image,
	Switch,
	ScrollView,
	ActivityIndicator,
	PermissionsAndroid,
	Platform,
	Button
} from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from 'expo-status-bar';
import {
	BleError,
	BleManager,
	Characteristic,
	Device,
} from "react-native-ble-plx";
import * as ExpoDevice from "expo-device";
import { atob, btoa } from "react-native-quick-base64";

const DEVICE_NAME = "ESP32SB";
const ESP32_SERVICE_UUID = "1111";
const RECIVE_SLOT_CHARACTERISTIC = "2222";
const RECIVE_CAR_DATA_CHARACTERISTIC = "5555";
const SEND_CAR_DATA_CHARACTERISTIC = "3333";
const SEND_LIGHTNING_INFO_CHARACTERISTIC = "6666";

const ThemeContext = createContext();
const BluetoothContext = createContext();
const Tab = createBottomTabNavigator();
const bleManager = new BleManager();
let TEST = '';
const carData = [
	{ id: "1", brand: "Toyota", model: "Camry", color: "Белый", image: "https://via.placeholder.com/150", year: 2020 },
	{ id: "2", brand: "BMW", model: "X5", color: "Чёрный", image: "https://via.placeholder.com/150", year: 2019 },
];

const BluetoothProvider = ({ children }) => {
	const [device, setDevice] = useState(null);
	const [isConnected, setIsConnected] = useState(false);
	const [receivedData, setReceivedData] = useState("");

	// const monitorCharacteristic = useCallback(async (serviceUUID, characteristicUUID, callback) => {
	// 	if (!device || !device.isConnected) {
	// 		console.warn("Устройство не подключено");
	// 		return;
	// 	}
	// 	try {
	// 		console.log(`Starting monitoring for ${serviceUUID}/${characteristicUUID}`);
	// 		const subscription = device.monitorCharacteristicForService(
	// 			serviceUUID,
	// 			characteristicUUID,
	// 			(error, characteristic) => {
	// 				if (error) {
	// 					console.error("Ошибка мониторинга:", error);
	// 					return;
	// 				}
	// 				if (!characteristic?.value) {
	// 					console.log("Нет данных в характеристике");
	// 					return;
	// 				}
	// 				try {
	// 					const decodedValue = atob(characteristic.value);
	// 					console.log("Получены данные:", decodedValue);
	// 					setReceivedData(decodedValue);
	// 					if (callback) callback(decodedValue);
	// 				} catch (decodeError) {
	// 					console.error("Ошибка декодирования:", decodeError);
	// 				}
	// 			}
	// 		);
	// 		return () => {
	// 			console.log("Отмена мониторинга характеристики");
	// 			subscription.remove();
	// 		};
	// 	} catch (error) {
	// 		console.error("Ошибка при запуске мониторинга:", error);
	// 	}
	// }, [device]);
	// Функция для записи в характеристику

	const writeCharacteristic = useCallback(async (serviceUUID, characteristicUUID, data) => {
		if (!device || !device.isConnected) {
			console.warn("Устройство не подключено");
			return false;
		}
		try {
			const base64Data = btoa(String(data));
			await device.writeCharacteristicWithResponseForService(
				serviceUUID,
				characteristicUUID,
				base64Data
			);
			return true;
		} catch (error) {
			console.error("Ошибка записи:", error);
			return false;
		}
	}, [device]);

	// Функция для отправки данных
	const sendData = useCallback(async (data) => {
		return writeCharacteristic(ESP32_SERVICE_UUID, SEND_CAR_DATA_CHARACTERISTIC, data);
	}, [writeCharacteristic]);

	// const receiveData = useCallback((callback) => {
	// 	return monitorCharacteristic(ESP32_SERVICE_UUID, RECIVE_SLOT_CHARACTERISTIC, callback);
	// }, [monitorCharacteristic]);

	// Значение контекста
	const value = {
		device,
		isConnected,
		receivedData,
		setDevice,
		setIsConnected,
		//monitorCharacteristic,
		writeCharacteristic,
		sendData,
		//receiveData
	};
	return (
		<BluetoothContext.Provider value={value}>
			{children}
		</BluetoothContext.Provider>
	);
};

const BluetoothConnectionScreen = ({ onConnected }) => {
	const [isConnecting, setIsConnecting] = useState(false);
	const [status, setStatus] = useState("Нажмите для подключения");
	const { isDarkTheme } = useContext(ThemeContext);
	const {
		device,
		setDevice,
		setIsConnected,
	} = useContext(BluetoothContext);

	const requestPermissions = async () => {
		try {
			const [bluetoothScanPermission, bluetoothConnectPermission, fineLocationPermission] =
				await Promise.all([
					PermissionsAndroid.request(
						PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
						{
							title: "Bluetooth Scan Permission",
							message: "App needs Bluetooth scan permission to discover devices",
							buttonPositive: "OK",
						}
					),
					PermissionsAndroid.request(
						PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
						{
							title: "Bluetooth Connect Permission",
							message: "App needs Bluetooth connect permission to pair devices",
							buttonPositive: "OK",
						}
					),
					PermissionsAndroid.request(
						PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
						{
							title: "Location Permission",
							message: "Bluetooth Low Energy requires Location",
							buttonPositive: "OK",
						}
					),
				]);
			return (
				bluetoothScanPermission === PermissionsAndroid.RESULTS.GRANTED &&
				bluetoothConnectPermission === PermissionsAndroid.RESULTS.GRANTED &&
				fineLocationPermission === PermissionsAndroid.RESULTS.GRANTED
			);
		} catch (err) {
			console.warn("Error requesting permissions: ", err);
			return false;
		}
	};
	requestPermissions();

	const connectToDevice = async () => {
		const hasPermissions = await requestPermissions();
		if (!hasPermissions) {
			setStatus("Необходимы разрешения для Bluetooth");
			return;
		}
		bleManager.startDeviceScan(null, null, (error, device) => {
			setIsConnecting(true);
			setStatus("Поиск устройства...");
			if (error) {
				console.log("Ошибка: " + error.message);
				setStatus("Включите Bluetooth");
				setIsConnecting(false);
				setIsConnected(false);
				return;
			}
			if (device.name === DEVICE_NAME) {
				bleManager.stopDeviceScan();
				setStatus("Подключение к ESP32...");
				device.connect()
					.then((connectedDevice) => {
						connectedDevice.requestMTU(500)
						return connectedDevice.discoverAllServicesAndCharacteristics();
					})
					.then((connectedDevice) => {
						setDevice(connectedDevice);
						setIsConnected(true);
						setStatus("Подключено!");
						setTimeout(() => {
							onConnected(connectedDevice);
						}, 1000);
					})
					.catch((error) => {
						setStatus("Ошибка подключения: " + error.message);
						setIsConnecting(false);
						setIsConnected(false);
					});
			}
		});
	};
	useEffect(() => {
      if (!device) {
        return;
      }

      const subscription = bleManager.onDeviceDisconnected(
        device.id,
        (error, device) => {
          if (error) {
            console.log("Disconnected with error:", error);
          }
          setConnectionStatus("Disconnected");
          setIsConnected(false);
          console.log("Disconnected device");
          if (device) {
            setConnectionStatus("Reconnecting...");
            connectToDevice(device)
              .then(() => {
                setConnectionStatus("Connected");
                setIsConnected(true);
              })
              .catch((error) => {
                console.log("Reconnection failed: ", error);
                setConnectionStatus("Reconnection failed");
                setIsConnected(false);
                setDevice(null);
              });
          }
        }
      );

      return () => subscription.remove();
    }, [device]);

	useEffect(() => {
		console.log("device", device)
		if (!device || !device.isConnected) {
			return
		}
		const sub = device.monitorCharacteristicForService(
			ESP32_SERVICE_UUID,
			RECIVE_SLOT_CHARACTERISTIC,
			(error, char) => {
				console.log("char", char)
				if (error || !char) {
					return;
				}
				const rawValue = atob(char?.value ?? "");
				TEST = rawValue
				console.log("rawvalue", rawValue, typeof rawValue)
			}
		)
		return () => sub.remove()
	}, [device])


	return (
		<View style={[styles.connectionContainer, isDarkTheme && styles.darkConnectionContainer]}>
			<Text style={[styles.connectionText, isDarkTheme && styles.darkText]}>
				{status}
			</Text>
			{isConnecting && <ActivityIndicator size="large" color="#FF1493" />}
			{!isConnecting && (
				<TouchableOpacity style={styles.connectButton} onPress={connectToDevice}>
					<Text style={styles.buttonText}>Подключиться</Text>
				</TouchableOpacity>
			)}
		</View >
	);
};

const HomeScreen = () => {
	const { isDarkTheme } = useContext(ThemeContext);
	const {
		sendData,
		receiveData,
		receivedData,
		monitorCharacteristic,
		isConnected,
		device,
		setDevice,
		setIsConnected
	} = useContext(BluetoothContext);
	const [cars, setCars] = useState(carData);
	const [filteredCars, setFilteredCars] = useState(carData);
	const [search, setSearch] = useState("");
	const [selectedCar, setSelectedCar] = useState(null);
	const [modalVisible, setModalVisible] = useState(false);

	const sendCarData = async (car) => {
		if (!isConnected) {
			alert("Устройство не подключено!");
			return;
		}
		try {
			const data = `${car.brand} ${car.model} ${car.color} ${car.year} ihfhsdkhfsdhfidshihdsif`;
			console.log("Отправка данных:", data);
			const success = await sendData(data);
			console.log("Результат отправки:", success);

			if (success) {
				alert(`Данные отправлены: ${data}`);
			} else {
				alert("Ошибка отправки данных");
			}
		} catch (error) {
			alert(`Ошибка: ${error.message}`);
		}
	};
	const reconnectDevice = async () => {
		if (!device) {
			alert("Нет устройства для повторного подключения");
			return;
		}
		try {
			const connectedDevice = await device.connect();
			await connectedDevice.discoverAllServicesAndCharacteristics();
			setDevice(connectedDevice);
			setIsConnected(true);
			alert("Успешно переподключено!");
		} catch (error) {
			alert(`Ошибка переподключения: ${error.message}`);
		}
	};
	const handleSearch = (text) => {
		setSearch(text);
		setFilteredCars(
			cars.filter((car) =>
				`${car.brand} ${car.model}`.toLowerCase().includes(text.toLowerCase())
			)
		);
	};
	const openCarModal = (car) => {
		setSelectedCar(car);
		setModalVisible(true);
	};
	return (
		<View style={[styles.container, isDarkTheme && styles.darkContainer]}>
			<View style={[styles.statusContainer, isDarkTheme && styles.darkItem]}>
				<Text style={[styles.statusText, isDarkTheme && styles.darkText]}>
					Статус: {isConnected ? "Подключено" : "Отключено"}
				</Text>
				<View style={[styles.statusIndicator, { backgroundColor: isConnected ? '#4CAF50' : '#F44336' }]} />
			</View>
			{!isConnected && (
				<TouchableOpacity
					style={styles.reconnectButton}
					onPress={reconnectDevice}
				>
					<Text style={styles.buttonText}>Переподключиться</Text>
				</TouchableOpacity>
			)}
			<TextInput
				style={[styles.searchInput, isDarkTheme && styles.darkInput]}
				placeholder="Поиск машин..."
				placeholderTextColor={isDarkTheme ? "#ccc" : "#666"}
				value={search}
				onChangeText={handleSearch}
			/>
			<FlatList
				data={filteredCars}
				keyExtractor={(item) => item.id}
				renderItem={({ item }) => (
					<TouchableOpacity
						style={[styles.carItem, isDarkTheme && styles.darkItem]}
						onPress={() => openCarModal(item)}
					>
						<Image source={{ uri: item.image }} style={styles.carImage} />
						<View style={styles.carInfo}>
							<Text style={[styles.text, isDarkTheme && styles.darkText]}>
								{`${item.brand} ${item.model} - ${item.color}, ${TEST}`}

							</Text>
							<TouchableOpacity
								style={styles.sendButton}
								onPress={() => sendCarData(item)}
							>
								<Text style={styles.buttonText}>Отправить</Text>
							</TouchableOpacity>
						</View>
					</TouchableOpacity>
				)}
			/>
			{selectedCar && (
				<Modal visible={modalVisible} transparent animationType="slide">
					<View style={styles.modalContainer}>
						<View style={[styles.modalContent, isDarkTheme && styles.darkItem]}>
							<Image source={{ uri: selectedCar.image }} style={styles.carImageLarge} />
							<Text style={[styles.modalText, isDarkTheme && styles.darkText]}>
								{`${selectedCar.brand} ${selectedCar.model}`}
							</Text>
							<Text style={[styles.modalText, isDarkTheme && styles.darkText]}>
								{`Год выпуска: ${selectedCar.year}`}
							</Text>
							<Text style={[styles.modalText, isDarkTheme && styles.darkText]}>
								{`Цвет: ${selectedCar.color}`}
							</Text>
							<TouchableOpacity
								style={styles.sendButton}
								onPress={() => sendCarData(selectedCar)}
							>
								<Text style={styles.buttonText}>Отправить данные</Text>
							</TouchableOpacity>
							<TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
								<Text style={styles.buttonText}>Закрыть</Text>
							</TouchableOpacity>
						</View>
					</View>
				</Modal>
			)}
		</View>
	);
};

const SettingsScreen = () => {
	const { isDarkTheme, toggleTheme } = useContext(ThemeContext);

	return (
		<ScrollView style={[styles.container, isDarkTheme && styles.darkContainer]}>
			<View style={[styles.settingItem, isDarkTheme && styles.darkItem]}>
				<Text style={[styles.text, isDarkTheme && styles.darkText]}>Тёмная тема</Text>
				<Switch
					trackColor={{ false: "#767577", true: "#81b0ff" }}
					thumbColor={isDarkTheme ? "#f5dd4b" : "#f4f3f4"}
					onValueChange={toggleTheme}
					value={isDarkTheme}
				/>
			</View>
		</ScrollView>
	);
};

export default function App() {
	const [isDarkTheme, setIsDarkTheme] = useState(false);
	const [isConnected, setIsConnected] = useState(false);
	const [showConnectionScreen, setShowConnectionScreen] = useState(true);

	const toggleTheme = () => setIsDarkTheme(prev => !prev);

	const handleConnected = () => {
		setShowConnectionScreen(false);
	};
	return (
		<ThemeContext.Provider value={{ isDarkTheme, toggleTheme }}>
			<BluetoothProvider>
				{showConnectionScreen ? (
					<BluetoothConnectionScreen onConnected={handleConnected} />
				) : (
					<NavigationContainer>
						<Tab.Navigator
							screenOptions={({ route }) => ({
								tabBarIcon: ({ focused, color, size }) => {
									let iconName;

									if (route.name === "Главная") {
										iconName = focused ? "home" : "home-outline";
									} else if (route.name === "Настройки") {
										iconName = focused ? "settings" : "settings-outline";
									}

									return <Ionicons name={iconName} size={size} color={color} />;
								},
								tabBarActiveTintColor: "#FF1493",
								tabBarInactiveTintColor: "gray",
							})}
						>
							<Tab.Screen name="Главная" component={HomeScreen} />
							<Tab.Screen name="Настройки" component={SettingsScreen} />
						</Tab.Navigator>
					</NavigationContainer>
				)}
				<StatusBar style={isDarkTheme ? "light" : "dark"} />
			</BluetoothProvider>
		</ThemeContext.Provider>
	);
}

const styles = StyleSheet.create({
	statusContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		padding: 15,
		backgroundColor: '#800080',
		borderRadius: 10,
		marginBottom: 10,
	},
	statusText: {
		fontSize: 16,
		color: '#FFC0CB',
	},
	statusIndicator: {
		width: 12,
		height: 12,
		borderRadius: 6,
	},
	dataContainer: {
		padding: 15,
		backgroundColor: '#800080',
		borderRadius: 10,
		marginBottom: 10,
	},
	historyContainer: {
		padding: 15,
		backgroundColor: '#800080',
		borderRadius: 10,
		marginBottom: 15,
		maxHeight: 200,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: 'bold',
		color: '#FFC0CB',
		marginBottom: 8,
	},
	dataText: {
		fontSize: 14,
		color: '#FFC0CB',
	},
	historyList: {
		flexGrow: 0,
	},
	historyItem: {
		paddingVertical: 5,
		borderBottomWidth: 1,
		borderBottomColor: 'rgba(255,192,203,0.3)',
	},
	historyText: {
		fontSize: 12,
		color: '#FFC0CB',
	},
	container: {
		flex: 1,
		padding: 10,
		backgroundColor: "#4B0082",
	},
	darkContainer: {
		backgroundColor: "#121212",
	},
	text: {
		fontSize: 18,
		color: "#FFC0CB",
		textAlign: "center",
	},
	darkText: {
		color: "#FFFFFF",
	},
	searchInput: {
		backgroundColor: "#fff",
		padding: 10,
		borderRadius: 10,
		marginBottom: 10,
		color: "#000",
	},
	darkInput: {
		backgroundColor: "#333",
		color: "#fff",
	},
	reconnectButton: {
		backgroundColor: '#FF6347',
		padding: 15,
		borderRadius: 10,
		marginBottom: 10,
		width: '100%',
		alignItems: 'center',
	},
	carItem: {
		flexDirection: "row",
		alignItems: "center",
		padding: 10,
		backgroundColor: "#800080",
		marginBottom: 10,
		borderRadius: 10,
	},
	darkItem: {
		backgroundColor: "#333",
	},
	carImage: {
		width: 50,
		height: 50,
		marginRight: 10,
		borderRadius: 5,
	},
	carInfo: {
		flex: 1,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	modalContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0,0,0,0.5)",
	},
	modalContent: {
		backgroundColor: "#800080",
		padding: 20,
		borderRadius: 10,
		alignItems: "center",
		width: "80%",
	},
	carImageLarge: {
		width: 200,
		height: 200,
		marginBottom: 10,
		borderRadius: 10,
	},
	modalText: {
		fontSize: 20,
		color: "#FFC0CB",
		marginBottom: 10,
	},
	closeButton: {
		marginTop: 10,
		backgroundColor: "#FF1493",
		padding: 10,
		borderRadius: 10,
		width: '100%',
		alignItems: 'center',
	},
	sendButton: {
		backgroundColor: "#FF1493",
		padding: 8,
		borderRadius: 5,
		marginLeft: 10,
	},
	buttonText: {
		color: "white",
		fontSize: 14,
	},
	settingItem: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		padding: 15,
		backgroundColor: "#800080",
		marginBottom: 10,
		borderRadius: 10,
	},
	connectionContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: '#4B0082',
		padding: 20,
	},
	darkConnectionContainer: {
		backgroundColor: '#121212',
	},
	connectionText: {
		fontSize: 20,
		marginBottom: 20,
		color: '#FFC0CB',
		textAlign: 'center',
	},
	connectButton: {
		backgroundColor: '#FF1493',
		padding: 15,
		borderRadius: 10,
		width: '80%',
		alignItems: 'center',
	},
});


