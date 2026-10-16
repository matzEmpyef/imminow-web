import { useMe } from '@/queries/me'
import { useMyConsultancy } from '@/queries/consultancy'
import { LOCAL_PHONE_REGION } from '@/lib/validation'

/**
 * The calling code of a country, by the name the console keeps it under. A staff phone typed without
 * a country code is read in the consultancy's own country (decision 154, ruling 4).
 */
const DIAL_CODES: Record<string, string> = {
  afghanistan: '93',
  albania: '355',
  algeria: '213',
  argentina: '54',
  armenia: '374',
  australia: '61',
  austria: '43',
  azerbaijan: '994',
  bahrain: '973',
  bangladesh: '880',
  belarus: '375',
  belgium: '32',
  bhutan: '975',
  bolivia: '591',
  brazil: '55',
  brunei: '673',
  bulgaria: '359',
  cambodia: '855',
  canada: '1',
  chile: '56',
  china: '86',
  colombia: '57',
  'costa rica': '506',
  croatia: '385',
  cyprus: '357',
  'czech republic': '420',
  czechia: '420',
  denmark: '45',
  ecuador: '593',
  egypt: '20',
  estonia: '372',
  ethiopia: '251',
  fiji: '679',
  finland: '358',
  france: '33',
  georgia: '995',
  germany: '49',
  ghana: '233',
  greece: '30',
  'hong kong': '852',
  hungary: '36',
  iceland: '354',
  india: '91',
  indonesia: '62',
  iran: '98',
  iraq: '964',
  ireland: '353',
  israel: '972',
  italy: '39',
  japan: '81',
  jordan: '962',
  kazakhstan: '7',
  kenya: '254',
  kuwait: '965',
  kyrgyzstan: '996',
  laos: '856',
  latvia: '371',
  lebanon: '961',
  lithuania: '370',
  luxembourg: '352',
  malaysia: '60',
  maldives: '960',
  malta: '356',
  mauritius: '230',
  mexico: '52',
  moldova: '373',
  mongolia: '976',
  morocco: '212',
  myanmar: '95',
  nepal: '977',
  netherlands: '31',
  'new zealand': '64',
  nigeria: '234',
  norway: '47',
  oman: '968',
  pakistan: '92',
  panama: '507',
  peru: '51',
  philippines: '63',
  poland: '48',
  portugal: '351',
  qatar: '974',
  romania: '40',
  russia: '7',
  'saudi arabia': '966',
  serbia: '381',
  singapore: '65',
  slovakia: '421',
  slovenia: '386',
  'south africa': '27',
  'south korea': '82',
  spain: '34',
  'sri lanka': '94',
  sweden: '46',
  switzerland: '41',
  taiwan: '886',
  tanzania: '255',
  thailand: '66',
  turkey: '90',
  uganda: '256',
  ukraine: '380',
  'united arab emirates': '971',
  uae: '971',
  'united kingdom': '44',
  uk: '44',
  'united states': '1',
  'united states of america': '1',
  usa: '1',
  uruguay: '598',
  uzbekistan: '998',
  vietnam: '84',
  zambia: '260',
  zimbabwe: '263',
}

/** The calling code (digits only) for a country name, or undefined when it is not one we know. */
export function dialCodeFor(country: string | null | undefined): string | undefined {
  return country ? DIAL_CODES[country.trim().toLowerCase()] : undefined
}

/**
 * Where a phone typed without a country code is read, for a consultancy based in `country`: its
 * calling code; `LOCAL_PHONE_REGION` when it has a country this console has no code for (the server
 * reads it); undefined when it has none, so the country code is asked for.
 */
export function phoneRegionOf(country: string | null | undefined): string | undefined {
  if (!country || !country.trim()) return undefined
  return dialCodeFor(country) ?? LOCAL_PHONE_REGION
}

/**
 * The region a staff member's phone numbers are read in: their consultancy's country. Undefined for
 * platform staff and anyone whose consultancy has no country (those forms ask for the country code),
 * and until the consultancy has loaded.
 */
export function usePhoneRegion(): string | undefined {
  const me = useMe().data
  const isConsultancyStaff = me?.scope === 'consultancy' || me?.scope === 'institute'
  const consultancy = useMyConsultancy({ enabled: isConsultancyStaff })
  return phoneRegionOf(consultancy.data?.country)
}
