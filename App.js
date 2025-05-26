import React, {
	useState,
	useEffect,
	createContext,
	useContext,
	useCallback,
} from "react";
import {
	View,
	Text,
	FlatList,
	StyleSheet,
	TextInput,
	TouchableOpacity,
	Modal,
	Switch,
	ScrollView,
	ActivityIndicator,
	PermissionsAndroid,
	Platform,
} from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from 'expo-status-bar';
import { BleManager } from "react-native-ble-plx";
import { atob, btoa } from "react-native-quick-base64";

const DEVICE_NAME = "SmartboxHSE";
const ESP32_SERVICE_UUID = "d8d07f89-c412-43d8-8d89-d9bd9f4c2314";
const RECIVE_SLOT_CHARACTERISTIC = "cd1f68ad-8990-492d-a8c1-412674941097";
const SEND_CAR_DATA_CHARACTERISTIC = "1eec0220-bdb0-4d99-9840-cc965d79021b";

const ThemeContext = createContext();
const BluetoothContext = createContext();

const Tab = createBottomTabNavigator();
const bleManager = new BleManager();

const BluetoothProvider = ({ children }) => {
	const [device, setDevice] = useState(null);
	const [isConnected, setIsConnected] = useState(false);
	const [isConnecting, setIsConnecting] = useState(false);
	const [receivedData, setReceivedData] = useState("");
	const [status, setStatus] = useState("Нажмите для подключения");

	const requestPermissions = async () => {
		try {
			const isAndroid12OrHigher = Platform.Version >= 31;
			let permissionsToRequest = [];
			let permissionRationales = {};
			if (isAndroid12OrHigher) {
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
				console.error("Connecting error: " + error.message);
				setStatus("Ошибка: " + error.message);
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
						setIsConnecting(false);
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
	// Отмена соединения
	const cancelConnection = async () => {
		bleManager.stopDeviceScan();
		bleManager.cancelDeviceConnection()
		setIsConnecting(false)
		setIsConnected(false)
		setStatus("Нажмите для подключения")
	}
	// Действия при отключении соединения
	useEffect(() => {
		if (!device) return;
		const disconnectSubscription = bleManager.onDeviceDisconnected(device.id, (error) => {
			if (error) {
				console.log("Disconnected with error:", error);
			}
			console.log('disconnect')
			// setIsConnected(false);
			// connectToDevice();
		});
		const charSubscription = monitorDeviceCharacteristics(device);
		return () => {
			disconnectSubscription.remove();
			charSubscription?.remove();
		};
	}, [device]);
	// Получение данных
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
	// Отправка данных
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
		cancelConnection,
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
		cancelConnection
	} = useContext(BluetoothContext);

	return (
		<View style={[styles.connectionContainer, isDarkTheme && styles.darkContainer]}>
			<Text style={[styles.connectionText, isDarkTheme && styles.darkText]}>
				{status}
			</Text>
			{isConnecting ? (
				<>
					<ActivityIndicator size="large" color="#6C63FF" style={{ marginBottom: 24 }} />
					<TouchableOpacity style={styles.connectButton} onPress={cancelConnection}>
						<Text style={styles.buttonText}>Отменить</Text>
					</TouchableOpacity>
				</>
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
	const [localCarData, setLocalCarData] = useState("");
	const [modalVisible, setModalVisible] = useState(false);
	const [lightingStatus, setLightingStatus] = useState({});
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
	useEffect(() => {
		if (receivedData) {
			setLocalCarData(receivedData);
		}
	}, [receivedData]);
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
			const isClearing = !editData.brand && !editData.model && !editData.color && !editData.year;
			// Формируем строку для ESP32
			const dataString = isClearing
				? `${selectedCar.id}|Empty`  // Формат для очистки
				: `${selectedCar.id}|${editData.brand}|${editData.model}|${editData.color}|${editData.year}`;
			// const dataString = `${selectedCar.id}|${editData.brand}|${editData.model}|${editData.color}|${editData.year}`;
			const success = await sendData(dataString);
			if (success) {
				console.log(`Данные отправлены: ${dataString}`);
				const updatedData = localCarData.split('#').map(slot => {
					const parts = slot.split('|');
					if (parts[0] === selectedCar.id) {
						return dataString;
					}
					return slot;
				}).join('#');

				setLocalCarData(updatedData);
				setModalVisible(false);
			} else {
				alert("Ошибка, повторите попытку");
			}
		} catch (error) {
			alert(`Ошибка: ${error.message}`);
		}
	};
	const sendLightingData = async (car) => {
		if (!isConnected) {
			alert("Устройство не подключено!");
			return;
		}
		try {
			const newStatus = !lightingStatus[car.id];
			const dataString = `${car.id}|light|${newStatus}`;
			const success = await sendData(dataString);

			if (success) {
				console.log(`Данные отправлены: ${dataString}`);
				setLightingStatus(prev => ({
					...prev,
					[car.id]: newStatus
				}));
			} else {
				alert("Ошибка, повторите попытку");
			}
		} catch (error) {
			alert(`Ошибка: ${error.message}`);
		}
	};
	// Обработчик изменения полей ввода
	const handleInputChange = (field, value) => {
		setEditData(prev => ({
			...prev,
			[field]: value
		}));
	};

	const cars = parseCarData(localCarData);
	const filteredCars = cars.filter(car =>
		car.isEmpty ||
		`${car.brand} ${car.model}`.toLowerCase().includes(search.toLowerCase())
	);
	const handleSearch = (text) => {
		setSearch(text);
	};
	return (
		<View style={[styles.container, isDarkTheme && styles.darkContainer]}>
			<TextInput
				style={isDarkTheme ? styles.darkSearchInput : styles.searchInput}
				placeholder="Поиск..."
				placeholderTextColor={isDarkTheme ? COLORS.white : COLORS.gray}
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
						<View style={styles.carInfo}>
							{item.isEmpty ? (
								<Text style={[styles.darkText]}>
									{`#${item.id} | Пустая`}
								</Text>
							) : (
								<>
									<Text style={[styles.text, isDarkTheme && styles.darkText]}>
										{`#${item.id} | ${item.brand} ${item.model} - ${item.color}`}
									</Text>
									<TouchableOpacity
										style={[
											styles.sendButton
										]}
										onPress={() => sendLightingData(item)}
									>
										<Text style={styles.buttonText}>{lightingStatus[item.id] ? "Отключить" : "Подсветить"}</Text>
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
							Ячейка {selectedCar?.id}
						</Text>
						<View style={styles.inputContainer}>
							<Text style={[styles.label, isDarkTheme && styles.darkText]}>Марка:</Text>
							<TextInput
								style={[styles.input, isDarkTheme && styles.darkInput]}
								value={editData.brand}
								onChangeText={(text) => handleInputChange('brand', text)}
								placeholderTextColor={isDarkTheme ? COLORS.darkPlaceholder : COLORS.lightPlaceholder}
								placeholder="Введите марку"
							/>
						</View>
						<View style={styles.inputContainer}>
							<Text style={[styles.label, isDarkTheme && styles.darkText]}>Модель:</Text>
							<TextInput
								style={[styles.input, isDarkTheme && styles.darkInput]}
								value={editData.model}
								onChangeText={(text) => handleInputChange('model', text)}
								placeholderTextColor={isDarkTheme ? COLORS.darkPlaceholder : COLORS.lightPlaceholder}
								placeholder="Введите модель"
							/>
						</View>

						<View style={styles.inputContainer}>
							<Text style={[styles.label, isDarkTheme && styles.darkText]}>Цвет:</Text>
							<TextInput
								style={[styles.input, isDarkTheme && styles.darkInput]}
								value={editData.color}
								onChangeText={(text) => handleInputChange('color', text)}
								placeholderTextColor={isDarkTheme ? COLORS.darkPlaceholder : COLORS.lightPlaceholder}
								placeholder="Введите цвет"
							/>
						</View>

						<View style={styles.inputContainer}>
							<Text style={[styles.label, isDarkTheme && styles.darkText]}>Год:</Text>
							<TextInput
								style={[styles.input, isDarkTheme && styles.darkInput]}
								value={editData.year}
								onChangeText={(text) => handleInputChange('year', text)}
								placeholderTextColor={isDarkTheme ? COLORS.darkPlaceholder : COLORS.lightPlaceholder}
								placeholder="Введите год"
								keyboardType="numeric"
							/>
						</View>

						<View style={styles.buttonRow}>
							<TouchableOpacity
								style={[styles.actionButton, styles.saveButton]}
								onPress={sendCarData}
							>
								<Text style={styles.buttonText}>Сохранить</Text>
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
					thumbColor={isDarkTheme ? "#6C63FF" : "#f4f3f4"}
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

	return (
		<>
			{!isConnected ? (
				<>
					<BluetoothConnectionScreen />
					<StatusBar style={"light"} />
				</>

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
							tabBarActiveTintColor: "#6C63FF",
							tabBarInactiveTintColor: "#666666",
						})}
					>
						<Tab.Screen name="Главная" component={HomeScreen} />
						<Tab.Screen name="Настройки" component={SettingsScreen} />
					</Tab.Navigator>
					<StatusBar style={"dark"} />
				</NavigationContainer>
			)}
		</>
	);
};

// Стили
const COLORS = {
	primary: '#1E1E2F',        // основной фон (темно-синий/фиолетовый оттенок)
	secondary: '#2A2A40',      // карточки и блоки
	accent: '#6C63FF',         // основной акцент (фиолетово-синий)
	lightAccent: '#A3A3FF',    // светлый акцент для текста
	darkBg: '#121212',         // черный фон
	darkItem: '#1C1C1C',       // карточки в тёмной теме
	error: '#EF5350',          // красный
	warning: '#FFA726',        // оранжевый
	success: '#4CAF50',        // зелёный
	reconnect: '#FF7043',      // яркий оранжевый
	white: '#FFFFFF',
	black: '#000000',
	gray: '#C4C4C4',
	darkGray: '#666666',
	lightPlaceholder: '#999999',  // cерый для светлой темы
	darkPlaceholder: '#CCCCCC',   // cветло-серый для темной темы
};
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
		gap: 8,
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
		padding: 4,
		minWidth: '25%',
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
