/**
 * How a form's field label is read to find what the applicant's profile already holds (H9). Letters
 * of every script are kept, so a label in Hindi or Tamil is a label and not blank space (Phase 9,
 * decision 154, ruling 13).
 */
export function normaliseLabel(label: string): string {
  // Letters of every script are kept, with the marks that belong to them (vowel signs): a label in
  // Hindi or Tamil is a label, not blank space (decision 154, ruling 13).
  return label
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{M} ]/gu, ' ')
    .replace(/ +/g, ' ')
    .trim()
}

// The same questions asked in the main Indian languages. A form is authored by each consultancy in
// whatever language its students read, so the fields the profile can fill are recognised by their
// wording in Hindi/Marathi, Tamil, Telugu, Bengali, Gujarati, Kannada, Malayalam and Punjabi too.
export const FIRST_NAME_WORDS = ['first name', 'given name', 'पहला नाम', 'प्रथम नाम', 'पहिले नाव']
export const LAST_NAME_WORDS = ['last name', 'surname', 'family name', 'अंतिम नाम', 'उपनाम', 'आडनाव']
export const NAME_ONLY_WORDS = ['name', 'applicant name', 'student name', 'candidate name', 'नाम', 'नाव', 'பெயர்', 'పేరు', 'নাম', 'નામ', 'ಹೆಸರು', 'പേര്', 'ਨਾਮ']
export const FULL_NAME_WORDS = ['full name', 'full legal name', 'legal name', 'name of applicant', 'name of the applicant', 'पूरा नाम', 'पूर्ण नाव']
export const EMAIL_WORDS = ['email', 'ईमेल', 'மின்னஞ்சல்', 'ఇమెయిల్', 'ইমেইল', 'ઈમેઇલ', 'ಇಮೇಲ್', 'ഇമെയിൽ', 'ਈਮੇਲ']
export const PHONE_WORDS = ['phone', 'mobile', 'contact number', 'फोन', 'मोबाइल', 'தொலைபேசி', 'மொபைல்', 'ఫోన్', 'మొబైల్', 'ফোন', 'মোবাইল', 'ફોન', 'મોબાઇલ', 'ಫೋನ್', 'ಮೊಬೈಲ್', 'ഫോൺ', 'മൊബൈൽ', 'ਫ਼ੋਨ', 'ਮੋਬਾਈਲ']
export const DOB_WORDS = ['date of birth', 'dob', 'birth date', 'जन्म तिथि', 'जन्मतिथि', 'பிறந்த தேதி', 'పుట్టిన తేదీ', 'জন্ম তারিখ', 'જન્મ તારીખ', 'ಜನ್ಮ ದಿನಾಂಕ', 'ജനനത്തീയതി', 'ਜਨਮ ਮਿਤੀ']
export const NATIONALITY_WORDS = ['nationality', 'citizenship', 'राष्ट्रीयता', 'नागरिकता', 'தேசியம்', 'జాతీయత', 'জাতীয়তা', 'રાષ્ટ્રીયતા', 'ರಾಷ್ಟ್ರೀಯತೆ', 'ദേശീയത', 'ਕੌਮੀਅਤ']
