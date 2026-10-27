import 'lang.dart';

/// The fee model, mirroring `propshop-web/src/lib/fees.ts` (owner, 2026-10-02).
///
/// TWO FEES. THAT IS ALL: the SUCCESS FEE, and optional PHOTOGRAPHY (EGP 10,000).
/// Listing is free.
///
/// SUCCESS FEE — FLAT BY UNIT TYPE, PER SIDE, BOTH SIDES IN FULL:
///   sale  apartment, studio, chalet                    50,000
///   sale  villa, townhouse, duplex, office, retail    100,000
///   rent  up to 100,000 / month                        15,000
///   rent  above 100,000 / month                        50,000
///   trade each owner pays the SALE fee for the type of unit they RECEIVE
///         (several units received → one fee, the highest)
///
/// The price does not move a sale fee: a 5M villa and a 60M villa pay the same.
///
/// DISPLAY RULE: shown per side only — never a whole-deal total.
///
/// A deal's fee is fixed by the SERVER at acceptance and arrives on the deal payload;
/// these functions are for screens with no deal yet. test/fees_test.dart pins them to
/// the server's table — if the two drift, the app quotes a fee the invoice will not match.

const double photographyFee = 10000;

const List<String> feeParties = ['buyer', 'seller'];

const Map<String, double> _saleFeeByType = {
  'apartment': 50000,
  'studio': 50000,
  'chalet': 50000,
  'ground_apartment': 50000,
  'villa': 100000,
  'townhouse': 100000,
  'twinhouse': 100000,
  'penthouse': 100000,
  'duplex': 100000,
  'office': 100000,
  'retail': 100000,
};

/// An unknown type (legacy data) pays the higher tier, so the app never under-quotes.
const double _fallbackSaleFee = 100000;

const double rentThreshold = 100000; // monthly rent, inclusive upper bound of the low tier
const double rentFeeLow = 15000;
const double rentFeeHigh = 50000;

double saleFeeForType(String unitType) => _saleFeeByType[unitType] ?? _fallbackSaleFee;

double rentFeeFor(double monthlyRent) =>
    monthlyRent.isFinite && monthlyRent > rentThreshold ? rentFeeHigh : rentFeeLow;

/// What ONE SIDE pays. `amount` is the sale price or the MONTHLY rent (only rent uses it).
double feePerSide({required String purpose, required String unitType, required double amount}) =>
    purpose == 'rent' ? rentFeeFor(amount) : saleFeeForType(unitType);

/// A trade: the fee for the units this side RECEIVES (one fee, the highest type).
double tradeFeeForReceived(List<String> receivedUnitTypes) {
  if (receivedUnitTypes.isEmpty) return 0;
  return receivedUnitTypes.map(saleFeeForType).reduce((a, b) => a > b ? a : b);
}

class FeeShares {
  const FeeShares({required this.total, required this.buyer, required this.seller});

  final double total;
  final double buyer;
  final double seller;

  /// One side's share by role name, matching the server's `role` field ("buyer"/"seller").
  double forRole(String role) => role == 'seller' ? seller : buyer;
}

/// Break a RECORDED whole-deal total back into what each side owes. Divides the recorded
/// total; never recomputes from the current schedule.
FeeShares splitFee(double total) {
  final safe = total.isFinite && total > 0 ? total : 0.0;
  final buyer = (safe / feeParties.length).roundToDouble();
  return FeeShares(total: safe, buyer: buyer, seller: safe - buyer);
}

const Map<String, String> feePartyLabelsAr = {'buyer': 'المشتري', 'seller': 'البائع'};
const Map<String, String> feePartyLabelsEn = {'buyer': 'Buyer', 'seller': 'Seller'};

/// A fee party's label in the current language.
String feePartyLabel(String party) => (isEn ? feePartyLabelsEn : feePartyLabelsAr)[party] ?? party;

/// The sanctioned description of the fee. Never "a flat fee of X": there are several.
const String pricingNoteAr =
    'رسم نجاح ثابت حسب نوع الوحدة، ومعلن من الأول: 50 ألف جنيه للشقق و100 ألف للفيلات والوحدات '
    'الكبيرة والتجاري. المشتري بيدفعه كامل والبائع بيدفعه كامل، مش نصه. مش نسبة من السعر، '
    'ومش بيزيد لما السعر يزيد، ومفيش عمولة من أي طرف.';

const String pricingNoteEn =
    'A fixed success fee by unit type, published before you commit: EGP 50,000 for apartments and '
    '100,000 for villas, larger units and commercial. The buyer pays it in full and so does the '
    'seller, not half. It is not a percentage of the price, it does not rise with the price, and '
    'there is no commission from either side.';

/// The whole fee model in a few sentences, for the hero and the listing wizard.
const String feeModelNoteAr =
    'نشر الإعلان مجاني. مفيش رسوم إعلان ولا اشتراك ولا ظهور مميز. بناخد فلوس بس لما '
    'الصفقة تتم: رسم نجاح ثابت حسب نوع الوحدة، وكل طرف بيدفعه لوحده. '
    'الجولة الافتراضية 360 لبيتك اختيارية بـ 10,000 جنيه.';

const String feeModelNoteEn =
    'Listing is free. No listing fee, no subscription, no paid placement. We are paid only '
    'when a deal completes: a fixed success fee by unit type that each side pays separately. '
    'A 360° virtual home tour is optional at EGP 10,000.';

String get pricingNote => isEn ? pricingNoteEn : pricingNoteAr;
String get feeModelNote => isEn ? feeModelNoteEn : feeModelNoteAr;
