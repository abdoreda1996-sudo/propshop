import '../services/lang.dart';
import 'listing.dart';

/// Mirrors HomeData in propshop-web/src/lib/home.ts — the discover payload both clients
/// render, so the app and the website cannot quote different counters.

class HomeCompound {
  const HomeCompound({
    required this.id,
    required this.slug,
    required this.nameAr,
    required this.nameEn,
    required this.developer,
    required this.areaAr,
    required this.areaEn,
    required this.units,
    required this.cover,
  });

  final String id;
  final String slug;
  final String nameAr;
  final String nameEn;
  final String developer;
  final String areaAr;
  final String areaEn;
  final int units;

  /// A real cover photo from a verified unit inside the compound, not stock.
  final String? cover;

  factory HomeCompound.fromJson(Map<String, dynamic> j) => HomeCompound(
    id: j['id'] as String,
    slug: (j['slug'] ?? '') as String,
    nameAr: (j['nameAr'] ?? '') as String,
    nameEn: (j['nameEn'] ?? '') as String,
    developer: (j['developer'] ?? '') as String,
    areaAr: (j['areaAr'] ?? '') as String,
    areaEn: (j['areaEn'] ?? '') as String,
    units: (j['units'] as num?)?.toInt() ?? 0,
    cover: j['cover'] as String?,
  );

  String get name => isEn && nameEn.isNotEmpty ? nameEn : nameAr;
  String get area => isEn && areaEn.isNotEmpty ? areaEn : areaAr;
}

class HomeArea {
  const HomeArea({
    required this.id,
    required this.slug,
    required this.nameAr,
    required this.nameEn,
    required this.city,
    required this.units,
    required this.cover,
  });

  final String id;
  final String slug;
  final String nameAr;
  final String nameEn;
  final String city;
  final int units;
  final String? cover;

  factory HomeArea.fromJson(Map<String, dynamic> j) => HomeArea(
    id: j['id'] as String,
    slug: (j['slug'] ?? '') as String,
    nameAr: (j['nameAr'] ?? '') as String,
    nameEn: (j['nameEn'] ?? '') as String,
    city: (j['city'] ?? '') as String,
    units: (j['units'] as num?)?.toInt() ?? 0,
    cover: j['cover'] as String?,
  );

  String get name => isEn && nameEn.isNotEmpty ? nameEn : nameAr;
}

class HomeData {
  const HomeData({
    required this.liveCount,
    required this.compoundCount,
    required this.closedCount,
    required this.newest,
    required this.topCompounds,
    required this.areas,
  });

  final int liveCount;
  final int compoundCount;
  final int closedCount;
  final List<ListingCard> newest;
  final List<HomeCompound> topCompounds;
  final List<HomeArea> areas;

  static List<T> _list<T>(dynamic raw, T Function(Map<String, dynamic>) make) =>
      ((raw as List?) ?? const [])
          .cast<Map<String, dynamic>>()
          .map(make)
          .toList();

  factory HomeData.fromJson(Map<String, dynamic> j) => HomeData(
    liveCount: (j['liveCount'] as num?)?.toInt() ?? 0,
    compoundCount: (j['compoundCount'] as num?)?.toInt() ?? 0,
    closedCount: (j['closedCount'] as num?)?.toInt() ?? 0,
    newest: _list(j['newest'], ListingCard.fromJson),
    topCompounds: _list(j['topCompounds'], HomeCompound.fromJson),
    areas: _list(j['areas'], HomeArea.fromJson),
  );
}

/// Governorate names. The server stores `city` in English only, so an Arabic screen
/// would otherwise print "Cairo" under an Arabic area name. Mirrors cityName() in
/// propshop-web/src/lib/i18n.ts.
const _cityAr = {
  'Cairo': 'القاهرة',
  'Giza': 'الجيزة',
  'Alexandria': 'الإسكندرية',
  'Red Sea': 'البحر الأحمر',
  'South Sinai': 'جنوب سيناء',
  'Matrouh': 'مطروح',
};

String cityName(String city) => isEn ? city : (_cityAr[city] ?? city);

/// "وحدة / وحدتين / وحدات" — Arabic marks 1, 2, 3-10 and 11+ differently, and "7 وحدة"
/// reads as broken Arabic. Mirrors unitsLabel() on the web.
String unitsLabel(int n) {
  if (isEn) return n == 1 ? 'unit' : 'units';
  if (n == 1) return 'وحدة';
  if (n == 2) return 'وحدتين';
  if (n >= 3 && n <= 10) return 'وحدات';
  return 'وحدة';
}
