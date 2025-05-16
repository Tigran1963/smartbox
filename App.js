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
import { BleManager } from "react-native-ble-plx";
import { atob, btoa } from "react-native-quick-base64";

const DEVICE_NAME = "ESP32SB";
const ESP32_SERVICE_UUID = "1111";
const RECIVE_SLOT_CHARACTERISTIC = "2222";
const SEND_CAR_DATA_CHARACTERISTIC = "3333";
const SEND_LIGHTNING_INFO_CHARACTERISTIC = "6666";

const ThemeContext = createContext();
const BluetoothContext = createContext();

const Tab = createBottomTabNavigator();
const bleManager = new BleManager();

const BluetoothProvider = ({ children }) => {
	const [device, setDevice] = useState(null);
	const [isConnected, setIsConnected] = useState(false);
	const [receivedData, setReceivedData] = useState("");
	const [isConnecting, setIsConnecting] = useState(false);
	const [status, setStatus] = useState("Нажмите для подключения");

	// const requestPermissions = async () => {
	// 	try {
	// 		const [bluetoothScanPermission, bluetoothConnectPermission, fineLocationPermission] =
	// 			await Promise.all([
	// 				PermissionsAndroid.request(
	// 					PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
	// 					{
	// 						title: "Bluetooth Scan Permission",
	// 						message: "App needs Bluetooth scan permission to discover devices",
	// 						buttonPositive: "OK",
	// 					}
	// 				),
	// 				PermissionsAndroid.request(
	// 					PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
	// 					{
	// 						title: "Bluetooth Connect Permission",
	// 						message: "App needs Bluetooth connect permission to pair devices",
	// 						buttonPositive: "OK",
	// 					}
	// 				),
	// 				PermissionsAndroid.request(
	// 					PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
	// 					{
	// 						title: "Location Permission",
	// 						message: "Bluetooth Low Energy requires Location",
	// 						buttonPositive: "OK",
	// 					}
	// 				),
	// 			]);
	// 		return (
	// 			bluetoothScanPermission === PermissionsAndroid.RESULTS.GRANTED &&
	// 			bluetoothConnectPermission === PermissionsAndroid.RESULTS.GRANTED &&
	// 			fineLocationPermission === PermissionsAndroid.RESULTS.GRANTED
	// 		);
	// 	} catch (err) {
	// 		console.warn("Error requesting permissions: ", err);
	// 		return false;
	// 	}
	// };
	const requestPermissions = async () => {
		try {
			// Проверяем версию Android
			const isAndroid12OrHigher = Platform.Version >= 31;

			let permissionsToRequest = [];
			let permissionRationales = {};

			if (isAndroid12OrHigher) {
				// Для Android 12+ запрашиваем новые разрешения
				permissionsToRequest = [
					PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
					PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
					PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
				];

				permissionRationales = {
					[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: {
						title: "Bluetooth Scan Permission",
						message: "App needs Bluetooth scan permission to discover devices",
						buttonPositive: "OK",
					},
					[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: {
						title: "Bluetooth Connect Permission",
						message: "App needs Bluetooth connect permission to pair devices",
						buttonPositive: "OK",
					},
					[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]: {
						title: "Location Permission",
						message: "Bluetooth Low Energy requires Location",
						buttonPositive: "OK",
					},
				};
			} else {
				// Для версий ниже Android 12
				permissionsToRequest = [
					PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
				];

				permissionRationales = {
					[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]: {
						title: "Location Permission",
						message: "Bluetooth Low Energy requires Location",
						buttonPositive: "OK",
					},
				};
			}

			const result = await PermissionsAndroid.requestMultiple(
				permissionsToRequest,
				permissionRationales
			);

			// Проверяем результаты
			if (isAndroid12OrHigher) {
				return (
					result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
					PermissionsAndroid.RESULTS.GRANTED &&
					result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
					PermissionsAndroid.RESULTS.GRANTED &&
					result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
					PermissionsAndroid.RESULTS.GRANTED
				);
			} else {
				return (
					result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
					PermissionsAndroid.RESULTS.GRANTED
				);
			}
		} catch (err) {
			console.warn("Error requesting permissions: ", err);
			return false;
		}
	};
	const connectToDevice = async () => {
		const hasPermissions = await requestPermissions();
		if (!hasPermissions) {
			setStatus("Необходимы разрешения для Bluetooth");
			return;
		}

		setIsConnecting(true);
		setStatus("Поиск устройства...");

		bleManager.startDeviceScan(null, null, (error, device) => {
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
						return connectedDevice.requestMTU(500)
							.then(() => connectedDevice.discoverAllServicesAndCharacteristics());
					})
					.then((connectedDevice) => {
						setDevice(connectedDevice);
						setIsConnected(true);
						setStatus("Подключено!");
						monitorDeviceCharacteristics(connectedDevice);
					})
					.catch((error) => {
						setStatus("Ошибка подключения: " + error.message);
						setIsConnecting(false);
						setIsConnected(false);
					});
			}
		});
	};

	const monitorDeviceCharacteristics = (device) => {
		const subscription = device.monitorCharacteristicForService(
			ESP32_SERVICE_UUID,
			RECIVE_SLOT_CHARACTERISTIC,
			(error, char) => {
				if (error) {
					console.error("Monitoring error:", error);
					return;
				}

				if (!char?.value) return;

				try {
					const rawValue = atob(char.value);
					setReceivedData(rawValue);
					console.log("Received data:", rawValue);
				} catch (decodeError) {
					console.error("Error decoding data:", decodeError);
				}
			}
		);

		return subscription;
	};
	// Убрать этот useEffect
	// useEffect(() => {
	// 	setReceivedData("1|Toyota|Camry|Black|2020#2|Empty")
	// }, [])

	useEffect(() => {
		if (!device) return;

		const disconnectSubscription = bleManager.onDeviceDisconnected(device.id, (error) => {
			if (error) {
				console.log("Disconnected with error:", error);
			}

			setStatus("Отключено");
			setIsConnected(false);

			// Автоматическое переподключение
			setStatus("Повторное подключение...");
			connectToDevice();
		});

		const charSubscription = monitorDeviceCharacteristics(device);

		return () => {
			disconnectSubscription.remove();
			charSubscription?.remove();
		};
	}, [device]);

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

	const sendData = useCallback(async (data) => {
		return writeCharacteristic(ESP32_SERVICE_UUID, SEND_CAR_DATA_CHARACTERISTIC, data);
	}, [writeCharacteristic]);

	const value = {
		device,
		isConnected,
		isConnecting,
		receivedData,
		status,
		connectToDevice,
		sendData,
		writeCharacteristic,
	};

	return (
		<BluetoothContext.Provider value={value}>
			{children}
		</BluetoothContext.Provider>
	);
};

const BluetoothConnectionScreen = () => {
	const { isDarkTheme } = useContext(ThemeContext);
	const {
		status,
		isConnecting,
		connectToDevice,
	} = useContext(BluetoothContext);

	return (
		<View style={[styles.connectionContainer, isDarkTheme && styles.darkConnectionContainer]}>
			<Text style={[styles.connectionText, isDarkTheme && styles.darkText]}>
				{status}
			</Text>
			{isConnecting ? (
				<ActivityIndicator size="large" color="#FF1493" />
			) : (
				<TouchableOpacity style={styles.connectButton} onPress={connectToDevice}>
					<Text style={styles.buttonText}>Подключиться</Text>
				</TouchableOpacity>
			)}
		</View>
	);
};
const HomeScreen = () => {
	const { isDarkTheme } = useContext(ThemeContext);
	const { receivedData, isConnected, sendData } = useContext(BluetoothContext);
	const [search, setSearch] = useState("");
	const [selectedCar, setSelectedCar] = useState(null);
	const [modalVisible, setModalVisible] = useState(false);
	const [editData, setEditData] = useState({
		brand: '',
		model: '',
		color: '',
		year: ''
	});

	// Парсинг данных с ESP32
	const parseCarData = (data) => {
		if (!data) return [];

		return data.split('#').filter(Boolean).map(slot => {
			const parts = slot.split('|');

			return {
				id: parts[0],
				brand: parts[1] === 'Empty' ? '' : parts[1],
				model: parts[1] === 'Empty' ? '' : parts[2],
				color: parts[1] === 'Empty' ? '' : parts[3],
				year: parts[1] === 'Empty' ? '' : parts[4],
				isEmpty: parts[1] === 'Empty'
			};
		});
	};

	// Открытие модального окна с заполнением данных
	const openCarModal = (car) => {
		setSelectedCar(car);
		setEditData({
			brand: car.brand || '',
			model: car.model || '',
			color: car.color || '',
			year: car.year || ''
		});
		setModalVisible(true);
	};

	// Отправка данных на ESP32
	const sendCarData = async () => {
		if (!isConnected) {
			alert("Устройство не подключено!");
			return;
		}

		try {
			// Формируем строку для ESP32 в формате "id|brand|model|color|year"
			const dataString = `${selectedCar.id}|${editData.brand}|${editData.model}|${editData.color}|${editData.year}`;
			const success = await sendData(dataString);

			if (success) {
				alert(`Данные отправлены: ${dataString}`);
				setModalVisible(false);
			} else {
				alert("Ошибка отправки данных");
			}
		} catch (error) {
			alert(`Ошибка: ${error.message}`);
		}
	};
	// const sendLightningData = async () => {
	// 	if (!isConnected) {
	// 		alert("Устройство не подключено!");
	// 		return;
	// 	}

	// 	try {
	// 		const dataString = `${selectedCar.id}|true`;
	// 		const success = await sendData(dataString);

	// 		if (success) {
	// 			alert(`Данные отправлены: ${dataString}`);
	// 			setModalVisible(false);
	// 		} else {
	// 			alert("Ошибка отправки данных");
	// 		}
	// 	} catch (error) {
	// 		alert(`Ошибка: ${error.message}`);
	// 	}
	// };
	// Обработчик изменения полей ввода
	const handleInputChange = (field, value) => {
		setEditData(prev => ({
			...prev,
			[field]: value
		}));
	};

	const cars = parseCarData(receivedData);
	const filteredCars = cars.filter(car =>
		car.isEmpty ||
		`${car.brand} ${car.model}`.toLowerCase().includes(search.toLowerCase())
	);
	const handleSearch = (text) => {
		setSearch(text);
	};
	return (
		<View style={[styles.container, isDarkTheme && styles.darkContainer]}>
			<View style={[styles.statusContainer, isDarkTheme && styles.darkItem]}>
				<Text style={[styles.statusText, isDarkTheme && styles.darkText]}>
					Статус: {isConnected ? "Подключено" : "Отключено"}
				</Text>
				<View style={[styles.statusIndicator, {
					backgroundColor: isConnected ? '#4CAF50' : '#F44336'
				}]} />
			</View>

			<TextInput
				style={isDarkTheme ? styles.darkSearchInput : styles.searchInput}
				placeholder="Поиск..."
				placeholderTextColor={isDarkTheme ? COLORS.lightAccent : COLORS.gray}
				value={search}
				onChangeText={handleSearch}
			/>

			<FlatList
				data={filteredCars}
				keyExtractor={(item) => item.id}
				renderItem={({ item }) => (
					<TouchableOpacity
						style={[
							styles.carItem,
							isDarkTheme && styles.darkItem,
							item.isEmpty ? styles.emptySlot : null
						]}
						onPress={() => openCarModal(item)}
					>
						<Image
							source={{ uri: item.image || "https://via.placeholder.com/150" }}
							style={styles.carImage}
						/>
						<View style={styles.carInfo}>
							{item.isEmpty ? (
								<Text style={[styles.text, isDarkTheme && styles.darkText]}>
									Слот {item.id} - Пусто
								</Text>
							) : (
								<>
									<Text style={[styles.text, isDarkTheme && styles.darkText]}>
										{`${item.brand} ${item.model} - ${item.color}`}
									</Text>
									<TouchableOpacity
										style={styles.sendButton}
										onPress={() => sendLightingData(item)}
									>
										<Text style={styles.buttonText}>Подсветить</Text>
									</TouchableOpacity>
								</>
							)}
						</View>
					</TouchableOpacity>
				)}
			/>


			<Modal visible={modalVisible} transparent animationType="slide">
				<View style={styles.modalContainer}>
					<View style={[styles.modalContent, isDarkTheme && styles.darkItem]}>
						<Text style={[styles.modalTitle, isDarkTheme && styles.darkText]}>
							Слот {selectedCar?.id}
						</Text>

						{/* Поля ввода */}
						<View style={styles.inputContainer}>
							<Text style={[styles.label, isDarkTheme && styles.darkText]}>Марка:</Text>
							<TextInput
								style={[styles.input, isDarkTheme && styles.darkInput]}
								value={editData.brand}
								onChangeText={(text) => handleInputChange('brand', text)}
								placeholder="Введите марку"
							/>
						</View>

						<View style={styles.inputContainer}>
							<Text style={[styles.label, isDarkTheme && styles.darkText]}>Модель:</Text>
							<TextInput
								style={[styles.input, isDarkTheme && styles.darkInput]}
								value={editData.model}
								onChangeText={(text) => handleInputChange('model', text)}
								placeholder="Введите модель"
							/>
						</View>

						<View style={styles.inputContainer}>
							<Text style={[styles.label, isDarkTheme && styles.darkText]}>Цвет:</Text>
							<TextInput
								style={[styles.input, isDarkTheme && styles.darkInput]}
								value={editData.color}
								onChangeText={(text) => handleInputChange('color', text)}
								placeholder="Введите цвет"
							/>
						</View>

						<View style={styles.inputContainer}>
							<Text style={[styles.label, isDarkTheme && styles.darkText]}>Год:</Text>
							<TextInput
								style={[styles.input, isDarkTheme && styles.darkInput]}
								value={editData.year}
								onChangeText={(text) => handleInputChange('year', text)}
								placeholder="Введите год"
								keyboardType="numeric"
							/>
						</View>

						{/* Кнопки действий */}
						<View style={styles.buttonRow}>
							<TouchableOpacity
								style={[styles.actionButton, styles.saveButton]}
								onPress={sendCarData}
							>
								<Text style={styles.buttonText}>Сохранить и отправить</Text>
							</TouchableOpacity>

							<TouchableOpacity
								style={[styles.actionButton, styles.clearButton]}
								onPress={() => {
									setEditData({
										brand: '',
										model: '',
										color: '',
										year: ''
									});
								}}
							>
								<Text style={styles.buttonText}>Очистить</Text>
							</TouchableOpacity>

							<TouchableOpacity
								style={[styles.actionButton, styles.closeButton]}
								onPress={() => setModalVisible(false)}
							>
								<Text style={styles.buttonText}>Закрыть</Text>
							</TouchableOpacity>
						</View>
					</View>
				</View>
			</Modal>
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
	const toggleTheme = () => setIsDarkTheme(prev => !prev);

	return (
		<ThemeContext.Provider value={{ isDarkTheme, toggleTheme }}>
			<BluetoothProvider>
				<MainAppContent />
			</BluetoothProvider>
		</ThemeContext.Provider>
	);
}
const MainAppContent = () => {
	const { isConnected } = useContext(BluetoothContext);
	const { isDarkTheme } = useContext(ThemeContext);
	// Должно быть !isConnected
	return (
		<>
			{!isConnected ? (
				<BluetoothConnectionScreen />
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
			<StatusBar style={"dark"} />
		</>
	);
};

const COLORS = {
	primary: '#4B0082',
	secondary: '#800080',
	accent: '#FF1493',
	lightAccent: '#FFC0CB',
	darkBg: '#121212',
	darkItem: '#333',
	error: '#F44336',
	warning: '#FF9800',
	success: '#4CAF50',
	reconnect: '#FF6347',
	white: '#FFFFFF',
	black: '#000000',
	gray: '#CCCCCC',
	darkGray: '#555',
};
// Общие стили
const COMMON = {
	container: {
		flex: 1,
		padding: 16,
		backgroundColor: COLORS.primary,
	},
	darkContainer: {
		backgroundColor: COLORS.darkBg,
	},
	text: {
		fontSize: 16,
		color: COLORS.lightAccent,
		textAlign: 'center',
	},
	darkText: {
		color: COLORS.white,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: 'bold',
		color: COLORS.lightAccent,
		marginBottom: 12,
	},
	card: {
		padding: 16,
		backgroundColor: COLORS.secondary,
		borderRadius: 10,
		marginBottom: 12,
	},
	button: {
		padding: 12,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center',
	},
	input: {
		borderWidth: 1,
		borderColor: COLORS.gray,
		borderRadius: 8,
		padding: 12,
		fontSize: 16,
		color: COLORS.black,
		backgroundColor: COLORS.white,
	},
	darkInput: {
		borderColor: COLORS.darkGray,
		color: COLORS.white,
		backgroundColor: COLORS.darkItem,
	},
};
const styles = StyleSheet.create({
	// Основные стили
	...COMMON,
	// Компоненты
	modalTitle: {
		fontSize: 20,
		fontWeight: 'bold',
		marginBottom: 20,
		textAlign: 'center',
		color: COLORS.lightAccent,
	},
	searchInput: {
		backgroundColor: COLORS.white,
		padding: 12,
		borderRadius: 12,
		marginBottom: 16,
		color: COLORS.black,
		fontSize: 16,
		shadowColor: COLORS.accent,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.2,
		shadowRadius: 4,
		elevation: 3,
	},
	darkSearchInput: {
		backgroundColor: COLORS.darkItem,
		color: COLORS.white,
		padding: 12,
		borderRadius: 12,
		marginBottom: 16,
		fontSize: 16,
		shadowColor: COLORS.accent,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.2,
		shadowRadius: 4,
		elevation: 3,
	},
	inputContainer: {
		marginBottom: 16,
		width: '100%',
	},

	label: {
		marginBottom: 8,
		fontSize: 16,
		color: COLORS.lightAccent,
	},

	buttonRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginTop: 20,
		width: '100%',
		gap: 12,
	},
	// Кнопки
	saveButton: {
		...COMMON.button,
		backgroundColor: COLORS.success,
		flex: 1,
	},
	clearButton: {
		...COMMON.button,
		backgroundColor: COLORS.warning,
		flex: 1,
	},
	closeButton: {
		...COMMON.button,
		backgroundColor: COLORS.error,
		flex: 1,
	},
	actionButton: {
		...COMMON.button,
		minWidth: '30%',
	},
	sendButton: {
		...COMMON.button,
		backgroundColor: COLORS.accent,
		padding: 8,
		marginLeft: 10,
	},
	reconnectButton: {
		...COMMON.button,
		backgroundColor: COLORS.reconnect,
		width: '100%',
		marginBottom: 12,
	},
	connectButton: {
		...COMMON.button,
		backgroundColor: COLORS.accent,
		width: '80%',
	},
	// Элементы списка
	carItem: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		backgroundColor: COLORS.secondary,
		marginBottom: 12,
		borderRadius: 10,
	},
	darkItem: {
		backgroundColor: COLORS.darkItem,
	},
	carImage: {
		width: 50,
		height: 50,
		marginRight: 12,
		borderRadius: 8,
	},
	carInfo: {
		flex: 1,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	// Модальные окна
	modalContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: 'rgba(0,0,0,0.7)',
	},
	modalContent: {
		...COMMON.card,
		alignItems: 'center',
		width: '85%',
	},
	carImageLarge: {
		width: 200,
		height: 200,
		marginBottom: 12,
		borderRadius: 12,
	},
	modalText: {
		fontSize: 18,
		color: COLORS.lightAccent,
		marginBottom: 12,
	},
	// Состояния
	statusContainer: {
		...COMMON.card,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	statusText: {
		fontSize: 16,
		color: COLORS.lightAccent,
	},
	statusIndicator: {
		width: 12,
		height: 12,
		borderRadius: 6,
	},
	// История и данные
	dataText: {
		fontSize: 14,
		color: COLORS.lightAccent,
	},
	historyContainer: {
		...COMMON.card,
		maxHeight: 200,
	},
	historyList: {
		flexGrow: 0,
	},
	historyItem: {
		paddingVertical: 8,
		borderBottomWidth: 1,
		borderBottomColor: 'rgba(255,192,203,0.3)',
	},
	historyText: {
		fontSize: 12,
		color: COLORS.lightAccent,
	},
	// Настройки
	settingItem: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		padding: 16,
		backgroundColor: COLORS.secondary,
		marginBottom: 12,
		borderRadius: 10,
	},
	// Пустые слоты
	emptySlot: {
		backgroundColor: COLORS.gray,
		opacity: 0.7,
	},
	// Текст кнопок
	buttonText: {
		color: COLORS.white,
		fontSize: 14,
		fontWeight: '500',
	},
	// Соединение
	connectionContainer: {
		...COMMON.container,
		justifyContent: 'center',
		alignItems: 'center',
	},
	connectionText: {
		fontSize: 18,
		marginBottom: 24,
		color: COLORS.lightAccent,
		textAlign: 'center',
	},
});
