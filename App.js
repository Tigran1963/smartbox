import React, { useState, useEffect, createContext, useContext } from "react";
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
	Platform
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
import base64 from "react-native-base64";

// const ESP32_UUID = "ea20ca9f-eca4-40b5-978c-f2bf13659ec7";
// const ESP32_CHARACTERISTIC = "e9291ab3-2633-4942-9a85-8a1a129eed14";

const ESP32_UUID = "1111";
const ESP32_CHARACTERISTIC = "2222";

const ThemeContext = createContext();
const Tab = createBottomTabNavigator();

const carData = [
	{ id: "1", brand: "Toyota", model: "Camry", color: "Белый", image: "https://via.placeholder.com/150", year: 2020 },
	{ id: "2", brand: "BMW", model: "X5", color: "Чёрный", image: "https://via.placeholder.com/150", year: 2019 },
	{ id: "3", brand: "Audi", model: "A6", color: "Серебристый", image: "https://via.placeholder.com/150", year: 2021 },
];

const BluetoothContext = createContext();

const BluetoothConnectionScreen = ({ onConnected }) => {
	const [isConnecting, setIsConnecting] = useState(false);
	const [status, setStatus] = useState("Нажмите для подключения");
	const { isDarkTheme } = useContext(ThemeContext);
	const bleManager = new BleManager();

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

			console.log("Ok")
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
		if (!ExpoDevice.isDevice) {
			setStatus("Это эмулятор - BLE не поддерживается");
			return;
		}

		bleManager.startDeviceScan(null, null, (error, device) => {
			setIsConnecting(true);
			setStatus("Поиск устройства...");
			if (error) {
				console.log("Ошибка: " + error.message);
				setStatus("Включите Bluetooth");
				setIsConnecting(false);
				return;
			}

			if (device.name === "ESP32SB") {
				bleManager.stopDeviceScan();
				setStatus("Подключение к ESP32...");
				console.log('Connected');
				device.connect()
					.then((connectedDevice) => {
						return connectedDevice.discoverAllServicesAndCharacteristics();
					})
					.then((connectedDevice) => {
						setStatus("Подключено!");
						setTimeout(() => {
							onConnected(connectedDevice);
						}, 1000);
					})
					.catch((error) => {
						setStatus("Ошибка подключения: " + error.message);
						setIsConnecting(false);
					});
			}
			// setTimeout(() => {
			// 	bleManager.stopDeviceScan();
			// 	setStatus("Не удалось подключиться, попробуйте заново")
			// 	setIsConnecting(false);
			// }, 5000);
		});
	};
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
	const { sendData, isConnected } = useContext(BluetoothContext);
	const [cars, setCars] = useState(carData);
	const [filteredCars, setFilteredCars] = useState(carData);
	const [search, setSearch] = useState("");
	const [selectedCar, setSelectedCar] = useState(null);
	const [modalVisible, setModalVisible] = useState(false);

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

	const sendCarData = (car) => {
		if (!isConnected) {
			alert("Устройство не подключено!");
			return;
		}

		const data = `${car.brand} ${car.model} ${car.color} ${car.year}`;
		sendData(data);
		alert(`Данные отправлены: ${data}`);
	};

	return (
		<View style={[styles.container, isDarkTheme && styles.darkContainer]}>
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
								{`${item.brand} ${item.model} - ${item.color}`}
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
	const [device, setDevice] = useState(null);
	const [showConnectionScreen, setShowConnectionScreen] = useState(true);

	const toggleTheme = () => setIsDarkTheme(prev => !prev);

	// const sendData = (data) => {
	// 	if (!device) return;

	// 	const base64Data = base64.encode(data);
	// 	device.writeCharacteristicWithResponseForService(
	// 		ESP32_UUID,
	// 		ESP32_CHARACTERISTIC,
	// 		base64Data
	// 	).catch(error => {
	// 		console.error("Ошибка отправки данных:", error);
	// 	});
	// };

	const sendData = async (data) => {
		try {
			// Проверка подключения
			if (!device) {
				console.log('[BLE] Ошибка: устройство не подключено');
				alert('Устройство не подключено!');
				return;
			}

			console.log('[BLE] Пытаемся отправить данные:', data);
			console.log('[BLE] UUID сервиса:', ESP32_UUID);
			console.log('[BLE] UUID характеристики:', ESP32_CHARACTERISTIC);

			// Вариант 1: Отправка как строки (без base64)
			// console.log('[BLE] Пробуем отправить как строку...');
			// await device.writeCharacteristicWithResponseForService(
			// 	ESP32_UUID,
			// 	ESP32_CHARACTERISTIC,
			// 	data
			// );
			// console.log('[BLE] Данные успешно отправлены (как строка)');

			// Если вариант 1 не сработает, раскомментируй вариант 2:

			// Вариант 2: Отправка как base64
			const base64Data = base64.encode(data);
			console.log('[BLE] Base64 данные:', base64Data);
			await device.writeCharacteristicWithResponseForService(
				ESP32_UUID,
				ESP32_CHARACTERISTIC,
				base64Data
			);
			console.log('[BLE] Данные успешно отправлены (как base64)');

			alert('Данные успешно отправлены!');

		} catch (error) {
			console.error('[BLE] Полная ошибка:', error);
			console.error('[BLE] Код ошибки:', error.errorCode);
			console.error('[BLE] Сообщение:', error.message);
			console.error('[BLE] Дополнительная информация:', error);

			alert(`Ошибка отправки:\n${error.message}\n\nПроверь консоль для подробностей`);
		}
	};
	const handleConnected = (connectedDevice) => {
		setDevice(connectedDevice);
		setIsConnected(true);
		setShowConnectionScreen(false);
	};

	return (
		<ThemeContext.Provider value={{ isDarkTheme, toggleTheme }}>
			<BluetoothContext.Provider value={{ sendData, isConnected }}>
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
			</BluetoothContext.Provider>
		</ThemeContext.Provider>
	);
}

const styles = StyleSheet.create({
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
