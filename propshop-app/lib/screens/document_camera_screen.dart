import 'dart:convert';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

import '../services/lang.dart';

/// One photographed document page, ready for the API (`{mediaType, data}` base64).
typedef DocImage = ({String mediaType, String data});

/// Takes ONE photo of a document — an ID side, a selfie, an ownership contract page — and
/// returns it. Unlike CaptureScreen there is no GPS and no room: documents are judged by
/// what is on them (the server reads them), not by where they were photographed.
///
/// `selfie: true` prefers the front camera.
Future<DocImage?> takeDocumentPhoto(BuildContext context, {required String title, String? hint, bool selfie = false}) {
  return Navigator.of(context).push<DocImage>(
    MaterialPageRoute(builder: (_) => _DocumentCameraScreen(title: title, hint: hint, selfie: selfie)),
  );
}

class _DocumentCameraScreen extends StatefulWidget {
  const _DocumentCameraScreen({required this.title, this.hint, required this.selfie});
  final String title;
  final String? hint;
  final bool selfie;
  @override
  State<_DocumentCameraScreen> createState() => _DocumentCameraScreenState();
}

class _DocumentCameraScreenState extends State<_DocumentCameraScreen> {
  CameraController? _controller;
  Future<void>? _init;
  String? _error;

  /// A failed shot. Kept apart from [_error] so the preview and shutter stay usable.
  String? _shotError;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _setup();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _setup() async {
    try {
      final cameras = await availableCameras();
      if (!mounted) return;
      if (cameras.isEmpty) {
        setState(() => _error = tr('مافيش كاميرا متاحة على الجهاز ده.', 'No camera is available on this device.'));
        return;
      }
      final want = widget.selfie ? CameraLensDirection.front : CameraLensDirection.back;
      final cam = cameras.firstWhere((c) => c.lensDirection == want, orElse: () => cameras.first);
      final controller = CameraController(cam, ResolutionPreset.high, enableAudio: false);
      setState(() {
        _controller = controller;
        _init = controller.initialize();
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = tr('مش قادرين نفتح الكاميرا. اتأكد إنك سمحت بالوصول ليها.', 'We could not open the camera. Make sure you allowed access to it.'));
    }
  }

  Future<void> _shoot() async {
    final c = _controller;
    if (c == null || !c.value.isInitialized) return;
    setState(() {
      _busy = true;
      _shotError = null;
    });
    try {
      final shot = await c.takePicture();
      final bytes = await shot.readAsBytes();
      if (!mounted) return;
      final png = shot.name.toLowerCase().endsWith('.png') || shot.mimeType == 'image/png';
      Navigator.of(context).pop((mediaType: png ? 'image/png' : 'image/jpeg', data: base64Encode(bytes)));
    } catch (_) {
      if (mounted) setState(() => _shotError = tr('الصورة ماتصورتش. جرّب تاني.', 'The photo did not save. Try again.'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(backgroundColor: Colors.black, foregroundColor: Colors.white, title: Text(widget.title)),
      body: Column(
        children: [
          Expanded(
            child: _error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white)),
                    ),
                  )
                : FutureBuilder(
                    future: _init,
                    builder: (context, snap) => snap.connectionState != ConnectionState.done || _controller == null
                        ? const Center(child: CircularProgressIndicator(color: Colors.white))
                        : CameraPreview(_controller!),
                  ),
          ),
          Container(
            color: Colors.black,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            child: SafeArea(
              top: false,
              child: Column(
                children: [
                  if (widget.hint != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(widget.hint!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70, height: 1.5)),
                    ),
                  if (_shotError != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Text(_shotError!, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFFFFB4A8), fontSize: 12.5)),
                    ),
                  SizedBox(
                    width: 72,
                    height: 72,
                    child: FilledButton(
                      style: FilledButton.styleFrom(shape: const CircleBorder(), padding: EdgeInsets.zero, backgroundColor: Colors.white),
                      onPressed: (_busy || _error != null) ? null : _shoot,
                      child: _busy ? const CircularProgressIndicator() : const Icon(Icons.camera_alt, color: Colors.black, size: 30),
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
