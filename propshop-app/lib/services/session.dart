import 'package:flutter/foundation.dart';
import 'api.dart';

/// Holds the signed-in user and the counters the app shell shows.
class SessionController extends ChangeNotifier {
  SessionController(this._api);

  final Api _api;

  bool _loading = true;
  Map<String, dynamic>? _user;
  Map<String, dynamic> _counts = const {};
  Set<String> _savedIds = {};
  int _unreadNotifications = 0;

  /// Unread in-app notifications (new trade matches…) — the badge on Account.
  int get unreadNotifications => _unreadNotifications;

  bool get loading => _loading;
  Map<String, dynamic>? get user => _user;
  Map<String, dynamic> get counts => _counts;
  bool get isSignedIn => _user != null;

  /// Listings this user saved — one fetch per session, shared by every heart.
  bool isSaved(String listingId) => _savedIds.contains(listingId);

  String get fullName => (_user?['fullName'] ?? '') as String;
  int get trustLevel => (_user?['trustLevel'] as num?)?.toInt() ?? 0;
  String get role => (_user?['role'] ?? 'buyer') as String;

  /// Back-office roles — they see the staff panel. The server still checks every call.
  /// Photographers too: their tour-shoot bookings are the one queue they get.
  bool get isStaff => const {'admin', 'reviewer', 'advisor', 'photographer'}.contains(role);

  Future<void> bootstrap() async {
    await _api.loadTokens();
    await refresh();
  }

  Future<void> refresh() async {
    _loading = true;
    notifyListeners();
    try {
      final json = await _api.me();
      _user = json['user'] as Map<String, dynamic>?;
      _counts = (json['counts'] as Map<String, dynamic>?) ?? const {};
      try {
        final saved = await _api.savedIds();
        _savedIds = ((saved['ids'] as List?) ?? const []).cast<String>().toSet();
      } on ApiException {
        // Hearts stay empty; nothing else depends on them.
      }
      await refreshNotifications(notify: false);
    } on ApiException {
      // A missing or expired session is an ordinary state, not an error to surface.
      _user = null;
      _counts = const {};
      _savedIds = {};
      _unreadNotifications = 0;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Re-reads the unread notification count. A server without the notifications table
  /// yet costs the badge, nothing else.
  Future<void> refreshNotifications({bool notify = true}) async {
    if (_user == null) return;
    try {
      final j = await _api.notifications();
      _unreadNotifications = (j['unread'] as num?)?.toInt() ?? 0;
    } on ApiException {
      _unreadNotifications = 0;
    }
    if (notify) notifyListeners();
  }

  /// Optimistic toggle; rolls back if the server refuses. Returns false when signed out.
  Future<bool> toggleSaved(String listingId) async {
    if (!isSignedIn) return false;
    final wasSaved = _savedIds.contains(listingId);
    wasSaved ? _savedIds.remove(listingId) : _savedIds.add(listingId);
    notifyListeners();
    try {
      wasSaved ? await _api.unsaveListing(listingId) : await _api.saveListing(listingId);
      final n = ((_counts['saved'] as num?)?.toInt() ?? 0) + (wasSaved ? -1 : 1);
      _counts = {..._counts, 'saved': n < 0 ? 0 : n};
    } on ApiException {
      wasSaved ? _savedIds.add(listingId) : _savedIds.remove(listingId);
    }
    notifyListeners();
    return true;
  }

  Future<void> signOut() async {
    await _api.signOut();
    _user = null;
    _counts = const {};
    _savedIds = {};
    _unreadNotifications = 0;
    notifyListeners();
  }
}
