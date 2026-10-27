import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';

import '../services/api.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';

/// In-app photo capture — the whole reason this app exists (Section 6c).
///
/// A photo is only trusted when it comes from this camera with a GPS fix and a
/// timestamp we produced. The server independently re-checks that the coordinates are
/// near the unit and demotes anything that is not, so nothing here is load-bearing for
/// security — it is the honest path, not the enforcement.
class CaptureScreen extends StatefulWidget {
  const CaptureScreen({
    super.key,
    required this.listingId,
    required this.capturedRooms,
  });

  final String listingId;
  final List<String> capturedRooms;

  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen> {
  CameraController? _controller;
  Future<void>? _initFuture;
  late List<String> _captured;

  String? _room;
  bool _busy = false;
  /// The camera could not start: nothing to shoot with.
  String? _error;

  /// One shot failed to save. The camera stays open so the owner can try again; this
  /// used to go into [_error], which replaced the preview and disabled the shutter.
  String? _shotError;
  Position? _position;
  String _locationState = 'pending';

  @override
  void initState() {
    super.initState();
    _captured = [...widget.capturedRooms];
    _room = requiredRooms.firstWhere(
      (r) => !_captured.contains(r),
      orElse: () => requiredRooms.first,
    );
    _setup();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _setup() async {
    await _resolveLocation();
    try {
      final cameras = await availableCameras();
      if (!mounted) return;
      if (cameras.isEmpty) {
        setState(
          () => _error = tr(
            'مافيش كاميرا متاحة على الجهاز ده.',
            'No camera is available on this device.',
          ),
        );
        return;
      }
      final controller = CameraController(
        cameras.first,
        ResolutionPreset.high,
        enableAudio: false,
      );
      setState(() {
        _controller = controller;
        _initFuture = controller.initialize();
      });
    } catch (e) {
      if (!mounted) return;
      setState(
        () => _error = tr(
          'مش قادرين نفتح الكاميرا. اتأكد إنك سمحت بالوصول ليها.',
          'We could not open the camera. Make sure you allowed access to it.',
        ),
      );
    }
  }

  /// A GPS fix is required before the capture counts; without it the photo would be
  /// demoted to a gallery upload by the server and would not satisfy the minimum.
  Future<void> _resolveLocation() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        if (mounted) setState(() => _locationState = 'disabled');
        return;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        if (mounted) setState(() => _locationState = 'denied');
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );
      if (!mounted) return;
      setState(() {
        _position = pos;
        _locationState = 'ready';
      });
    } catch (_) {
      if (mounted) setState(() => _locationState = 'error');
    }
  }

  Future<void> _capture() async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized || _room == null) {
      return;
    }

    // Resolve the API before the first await: holding a BuildContext across an async
    // gap is unsafe if this screen is popped mid-capture.
    final api = context.read<Api>();

    setState(() {
      _busy = true;
      _shotError = null;
    });

    try {
      final shot = await controller.takePicture();
      final capturedAt = DateTime.now();

      // Upload the photo itself. This used to register `shot.path` — a path on this
      // phone's disk — as the photo URL, so the image was broken everywhere else.
      final res = await api.uploadListingPhoto(
        widget.listingId,
        bytes: await shot.readAsBytes(),
        filename: shot.name.isNotEmpty ? shot.name : 'capture.jpg',
        room: _room!,
        gpsLat: _position?.latitude,
        gpsLng: _position?.longitude,
        capturedAt: capturedAt,
      );

      if (!mounted) return;
      // The server judged the GPS: say so now, rather than at the publish gate.
      if (res['demoted'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(tr(
            'الصورة اتحفظت، بس الموقع مش جوه الكمبوند (أو الـ GPS مقفول) فمش هتتحسب صورة موثّقة.',
            'Saved, but the location is not inside the compound (or GPS is off), so it will not count as a verified photo.',
          )),
        ));
      }
      setState(() {
        _captured = [..._captured, _room!];
        final next = requiredRooms.where((r) => !_captured.contains(r));
        _room = next.isEmpty ? null : next.first;
      });

      if (_room == null && mounted) {
        Navigator.of(context).pop(_captured);
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(
        () => _shotError = tr(
          'مش قادرين نحفظ الصورة (${e.code}).',
          'We could not save the photo (${e.code}).',
        ),
      );
    } catch (_) {
      if (!mounted) return;
      setState(
        () => _shotError = tr(
          'حصلت مشكلة أثناء التصوير.',
          'Something went wrong while taking the photo.',
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final remaining = requiredRooms.where((r) => !_captured.contains(r)).length;

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(
          tr(
            'تصوير الوحدة · باقي $remaining',
            'Photograph the unit · $remaining left',
          ),
        ),
        systemOverlayStyle: null,
        actions: const [LangToggleButton(onDark: true)],
      ),
      body: Column(
        children: [
          Expanded(
            child: _error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        _error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          height: 1.7,
                        ),
                      ),
                    ),
                  )
                : FutureBuilder(
                    future: _initFuture,
                    builder: (context, snapshot) {
                      if (snapshot.connectionState != ConnectionState.done ||
                          _controller == null) {
                        return const Center(
                          child: CircularProgressIndicator(color: Colors.white),
                        );
                      }
                      return Stack(
                        fit: StackFit.expand,
                        children: [
                          CameraPreview(_controller!),
                          PositionedDirectional(
                            top: 16,
                            start: 16,
                            end: 16,
                            child: _LocationBanner(
                              state: _locationState,
                              onRetry: _resolveLocation,
                            ),
                          ),
                        ],
                      );
                    },
                  ),
          ),

          Container(
            color: Colors.black,
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            child: SafeArea(
              top: false,
              child: Column(
                children: [
                  SizedBox(
                    height: 36,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: requiredRooms.map((room) {
                        final done = _captured.contains(room);
                        final active = _room == room;
                        return Padding(
                          padding: const EdgeInsetsDirectional.only(end: 8),
                          child: ChoiceChip(
                            label: Text(roomLabel(room)),
                            selected: active,
                            onSelected: done
                                ? null
                                : (_) => setState(() => _room = room),
                            avatar: done
                                ? const Icon(
                                    Icons.check,
                                    size: 15,
                                    color: AqarColors.ok700,
                                  )
                                : null,
                            backgroundColor: Colors.white10,
                            selectedColor: Colors.white,
                            labelStyle: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: active
                                  ? AqarColors.ink900
                                  : Colors.white70,
                            ),
                            side: BorderSide.none,
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                  const SizedBox(height: 18),
                  GestureDetector(
                    onTap: _busy || _room == null || _error != null
                        ? null
                        : _capture,
                    child: Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: _busy ? Colors.white38 : Colors.white,
                        border: Border.all(color: Colors.white24, width: 4),
                      ),
                      child: _busy
                          ? const Padding(
                              padding: EdgeInsets.all(20),
                              child: CircularProgressIndicator(
                                strokeWidth: 3,
                                color: AqarColors.ink900,
                              ),
                            )
                          : const Icon(
                              Icons.camera_alt,
                              color: AqarColors.ink900,
                            ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _room == null
                        ? tr(
                            'خلصت كل الصور المطلوبة',
                            'All required photos are done',
                          )
                        : tr(
                            'صوّر: ${roomLabel(_room!)}',
                            'Shoot: ${roomLabel(_room!)}',
                          ),
                    style: const TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                  if (_shotError != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        _shotError!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Color(0xFFFFB4A8), fontSize: 12.5, height: 1.5),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LocationBanner extends StatelessWidget {
  const _LocationBanner({required this.state, required this.onRetry});
  final String state;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (state == 'ready') {
      return Align(
        alignment: AlignmentDirectional.topStart,
        child: AqarBadge.verified(
          tr('الموقع مفعّل', 'Location on'),
          icon: Icons.location_on_outlined,
        ),
      );
    }

    final message = switch (state) {
      'disabled' => tr(
        'خدمة الموقع مقفولة. شغّلها عشان الصور تتوثق.',
        'Location services are off. Turn them on so the photos can be verified.',
      ),
      'denied' => tr(
        'محتاجين إذن الموقع عشان نثبت إن الصور اتصورت في الوحدة.',
        'We need location permission to prove the photos were taken at the unit.',
      ),
      'error' => tr(
        'مش قادرين نحدد موقعك دلوقتي.',
        'We cannot determine your location right now.',
      ),
      _ => tr('بنحدد موقعك…', 'Finding your location…'),
    };

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.75),
        borderRadius: BorderRadius.circular(AqarRadius.control),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                height: 1.5,
              ),
            ),
          ),
          if (state != 'pending')
            TextButton(
              onPressed: onRetry,
              child: Text(
                tr('حاول تاني', 'Try again'),
                style: const TextStyle(fontSize: 12, color: Colors.white),
              ),
            ),
        ],
      ),
    );
  }
}
