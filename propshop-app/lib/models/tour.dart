import '../services/lang.dart';

/// A virtual tour on a listing — mirrors the web's ListingTour payload.
///
/// `kind == 'video'`: an uploaded walkthrough; `url` is the video file and plays in the app.
/// `kind == 'embed'`: a hosted player (YouTube / Vimeo) or a 3D / 360° tour (Matterport /
/// Kuula); `url` is the provider's embed page, opened outside the app.
class Tour {
  Tour({
    required this.id,
    required this.kind,
    required this.provider,
    required this.url,
    this.posterUrl,
    this.title,
    this.status = 'approved',
    this.rejectReason,
  });

  final String id;
  final String kind;
  final String provider;
  final String url;
  final String? posterUrl;
  final String? title;

  /// pending | approved | rejected — only the owner and staff ever see the first and last.
  final String status;
  final String? rejectReason;

  bool get isVideo => kind == 'video';

  /// 3D / 360° tours are explored, not watched.
  bool get isImmersive => provider == 'matterport' || provider == 'kuula';

  String get providerLabel => switch (provider) {
        'upload' => tr('فيديو جولة', 'Video tour'),
        'youtube' => tr('يوتيوب', 'YouTube'),
        'vimeo' => tr('فيميو', 'Vimeo'),
        'matterport' => tr('جولة ثلاثية الأبعاد', '3D tour'),
        'kuula' => tr('جولة 360°', '360° tour'),
        _ => provider,
      };

  String get caption => (title ?? '').isNotEmpty ? title! : providerLabel;

  String get statusLabel => switch (status) {
        'pending' => tr('مستنية المراجعة', 'Awaiting review'),
        'approved' => tr('ظاهرة على الإعلان', 'Live on the listing'),
        'rejected' => tr('اترفضت', 'Rejected'),
        _ => status,
      };

  factory Tour.fromJson(Map<String, dynamic> j) => Tour(
        id: j['id'] as String,
        kind: (j['kind'] ?? 'embed') as String,
        provider: (j['provider'] ?? '') as String,
        url: (j['url'] ?? '') as String,
        posterUrl: j['posterUrl'] as String?,
        title: j['title'] as String?,
        status: (j['status'] ?? 'approved') as String,
        rejectReason: j['rejectReason'] as String?,
      );
}

/// The limit the server enforces (src/lib/tours.ts MAX_TOURS_PER_LISTING).
const maxToursPerListing = 3;

/// Why the server refused a tour, in the app's language.
String tourErrorMessage(String code) => switch (code) {
      'link_invalid' => tr('اللينك ده مش لينك فيديو أو جولة صالح.', "That isn't a valid video or tour link."),
      'provider_not_supported' => tr('بنقبل لينكات يوتيوب وفيميو وماتربورت وكوولا بس.', 'We accept YouTube, Vimeo, Matterport and Kuula links only.'),
      'too_many_tours' => tr('الحد $maxToursPerListing جولات للإعلان.', 'The limit is $maxToursPerListing tours per listing.'),
      'title_contact_details' => tr('العنوان مايقدرش يكون فيه أرقام تليفون أو لينكات.', "The title can't contain phone numbers or links."),
      'too_large' => tr('الفيديو أكبر من 200 ميجا.', 'The video is larger than 200 MB.'),
      'type_not_allowed' || 'not_a_video' => tr('ارفع فيديو MP4 أو MOV.', 'Upload an MP4 or MOV video.'),
      'listing_closed' => tr('الإعلان ده مقفول.', 'This listing is closed.'),
      'rate_limited' => tr('رفعت كتير. استنى شوية.', 'Too many uploads. Wait a little.'),
      'storage_driver_unsupported' => tr('رفع الفيديو مش متاح على السيرفر ده. حط لينك بداله.', "Video upload isn't available on this server. Add a link instead."),
      'network_error' => tr('مش قادرين نوصل للسيرفر. اتأكد من الإنترنت.', "We can't reach the server. Check your internet connection."),
      _ => tr('حصل خطأ ($code).', 'Something went wrong ($code).'),
    };
