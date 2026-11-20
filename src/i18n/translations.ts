export type LanguageCode = 'en' | 'bn' | 'hi' | 'ar';

export interface TranslationBundle {
  code: LanguageCode;
  nativeLabel: string;
  rtl: boolean;
  appName: string;
  offlineMessenger: string;
  tagline: string;
  slogan: string;
  startConnecting: string;
  noInternet: string;
  noMobileData: string;
  noSimBalance: string;
  noSubscription: string;
  navChats: string;
  navConnect: string;
  navNetwork: string;
  navFiles: string;
  navContacts: string;
  navProfile: string;
  bluetoothOn: string;
  bluetoothOff: string;
  nearbyLabel: string;
  connectedLabel: string;
  relayLabel: string;
  pendingLabel: string;
  sosTitle: string;
  sosButton: string;
  typeMessagePlaceholder: string;
}

export const TRANSLATIONS: Record<LanguageCode, TranslationBundle> = {
  en: {
    code: 'en',
    nativeLabel: 'English',
    rtl: false,
    appName: 'FREECONNECT',
    offlineMessenger: '100% OFFLINE MESSENGER',
    tagline: 'Connect • Chat • Share — Without Internet',
    slogan: 'Be Connected... Always!',
    startConnecting: 'START CONNECTING',
    noInternet: 'No Internet',
    noMobileData: 'No Mobile Data',
    noSimBalance: 'No SIM Balance',
    noSubscription: 'No Subscription',
    navChats: 'Chats',
    navConnect: 'Connect',
    navNetwork: 'Network',
    navFiles: 'Files',
    navContacts: 'Contacts',
    navProfile: 'Profile',
    bluetoothOn: 'Bluetooth ON',
    bluetoothOff: 'Bluetooth OFF',
    nearbyLabel: 'Nearby',
    connectedLabel: 'Connected',
    relayLabel: 'Relay Mesh',
    pendingLabel: 'Pending',
    sosTitle: 'Emergency SOS',
    sosButton: 'BROADCAST BLUETOOTH SOS',
    typeMessagePlaceholder: 'Encrypted offline message...',
  },
  bn: {
    code: 'bn',
    nativeLabel: 'বাংলা',
    rtl: false,
    appName: 'FREECONNECT',
    offlineMessenger: '১০০% অফলাইন মেসেঞ্জার',
    tagline: 'সংযুক্ত থাকুন • চ্যাট • শেয়ার — ইন্টারনেট ছাড়াই',
    slogan: 'সর্বদা সংযুক্ত থাকুন!',
    startConnecting: 'সংযোগ শুরু করুন',
    noInternet: 'ইন্টারনেট নেই',
    noMobileData: 'মোবাইল ডেটা নেই',
    noSimBalance: 'সিম ব্যালেন্স নেই',
    noSubscription: 'সাবস্ক্রিপশন নেই',
    navChats: 'চ্যাট',
    navConnect: 'সংযোগ',
    navNetwork: 'নেটওয়ার্ক',
    navFiles: 'ফাইল',
    navContacts: 'কন্টাক্টস',
    navProfile: 'প্রোফাইল',
    bluetoothOn: 'ব্লুটুথ চালু',
    bluetoothOff: 'ব্লুটুথ বন্ধ',
    nearbyLabel: 'কাছাকাছি',
    connectedLabel: 'সংযুক্ত',
    relayLabel: 'রিলে মেশ',
    pendingLabel: 'অপেক্ষমাণ',
    sosTitle: 'জরুরি এসওএস (SOS)',
    sosButton: 'ব্লুটুথ জরুরি বার্তা পাঠান',
    typeMessagePlaceholder: 'এনক্রিপ্টেড অফলাইন বার্তা লিখুন...',
  },
  hi: {
    code: 'hi',
    nativeLabel: 'हिन्दी',
    rtl: false,
    appName: 'FREECONNECT',
    offlineMessenger: '100% ऑफ़लाइन मैसेंजर',
    tagline: 'जुड़ें • चैट • शेयर — बिना इंटरनेट',
    slogan: 'हमेशा जुड़े रहें!',
    startConnecting: 'कनेक्ट शुरू करें',
    noInternet: 'बिना इंटरनेट',
    noMobileData: 'बिना डेटा',
    noSimBalance: 'बिना सिम बैलेंस',
    noSubscription: 'बिना शुल्क',
    navChats: 'चैट',
    navConnect: 'कनेक्ट',
    navNetwork: 'नेटवर्क',
    navFiles: 'फ़ाइलें',
    navContacts: 'संपर्क',
    navProfile: 'प्रोफ़ाइल',
    bluetoothOn: 'ब्लूटूथ चालू',
    bluetoothOff: 'ब्लूटूथ बंद',
    nearbyLabel: 'आस-पास',
    connectedLabel: 'जुड़े हुए',
    relayLabel: 'रिले मेश',
    pendingLabel: 'लंबित',
    sosTitle: 'आपातकालीन SOS',
    sosButton: 'ब्लूटूथ SOS प्रसारित करें',
    typeMessagePlaceholder: 'एन्क्रिप्टेड ऑफ़लाइन संदेश लिखें...',
  },
  ar: {
    code: 'ar',
    nativeLabel: 'العربية',
    rtl: true,
    appName: 'FREECONNECT',
    offlineMessenger: 'مراسلة بدون إنترنت ١٠٠٪',
    tagline: 'تواصل • دردش • شارك — بدون إنترنت',
    slogan: 'ابقَ متصلاً... دائماً!',
    startConnecting: 'ابدأ الاتصال',
    noInternet: 'بدون إنترنت',
    noMobileData: 'بدون بيانات',
    noSimBalance: 'بدون رصيد',
    noSubscription: 'بدون اشتراك',
    navChats: 'المحادثات',
    navConnect: 'اتصال',
    navNetwork: 'الشبكة',
    navFiles: 'الملفات',
    navContacts: 'جهات الاتصال',
    navProfile: 'الملف',
    bluetoothOn: 'البلوتوث مفعل',
    bluetoothOff: 'البلوتوث متوقف',
    nearbyLabel: 'قريب',
    connectedLabel: 'متصل',
    relayLabel: 'شبكة الترحيل',
    pendingLabel: 'معلق',
    sosTitle: 'طوارئ SOS',
    sosButton: 'بث نداء استغاثة بالبلوتوث',
    typeMessagePlaceholder: 'اكتب رسالة مشفرة دون إنترنت...',
  },
};
