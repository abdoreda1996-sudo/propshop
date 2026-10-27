import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/listing.dart';
import '../services/api.dart';
import '../services/lang.dart';
import 'listing_screen.dart';

/// Opens a listing when all we have is its reference (trade offers, matches).
///
/// ListingScreen renders from a search card, so this builds one from the detail endpoint
/// (the same payload the web listing page uses), then pushes the normal screen.
Future<void> openListingByReference(BuildContext context, String reference) async {
  final api = context.read<Api>();
  final nav = Navigator.of(context);
  final messenger = ScaffoldMessenger.of(context);
  try {
    final j = await api.listingDetail(reference);
    final card = listingCardFromDetail(j);
    nav.push(MaterialPageRoute(builder: (_) => ListingScreen(listing: card)));
  } on ApiException {
    messenger.showSnackBar(SnackBar(content: Text(tr('الوحدة دي مش متاحة.', 'This unit is not available.'))));
  }
}

/// Detail payload (GET /api/listings/[id]) → the card model ListingScreen expects.
ListingCard listingCardFromDetail(Map<String, dynamic> j) {
  final unit = (j['unit'] as Map<String, dynamic>?) ?? const {};
  final media = ((j['media'] as List?) ?? const []).cast<Map<String, dynamic>>();
  final cover = media.firstWhere((m) => m['isCover'] == true, orElse: () => media.isEmpty ? const {} : media.first);
  return ListingCard.fromJson({
    'id': j['id'],
    'reference': j['reference'],
    'titleAr': j['titleAr'],
    'titleEn': j['titleEn'],
    'price': j['price'],
    'currency': j['currency'],
    'purpose': j['purpose'],
    'paymentType': j['paymentType'],
    'photo': cover['thumb'] ?? cover['url'],
    // The card swipes through these; the detail screen loads full-size ones itself.
    'photos': [
      for (final m in [cover, ...media.where((m) => !identical(m, cover))])
        if ((m['thumb'] ?? m['url']) is String) m['thumb'] ?? m['url'],
    ],
    'withoutOver': j['withoutOver'] == true,
    'photoCount': media.length,
    'tourCount': ((j['tours'] as List?) ?? const []).length,
    'compoundAr': unit['compoundAr'],
    'compoundEn': unit['compoundEn'],
    'areaAr': unit['areaAr'],
    'areaEn': unit['areaEn'],
    'type': unit['type'],
    'bedrooms': unit['bedrooms'],
    'bathrooms': unit['bathrooms'],
    'sizeSqm': unit['sizeSqm'],
    'finishing': unit['finishing'],
    'deliveryStatus': unit['deliveryStatus'],
    'trustLevel': j['trustLevel'],
    'status': j['status'] ?? 'live',
    'fair': j['fair'],
    'verdict': j['verdict'],
  });
}
