import 'package:mangayomi/bridge_lib.dart';
import 'dart:convert';

class AniwatchtvSource extends MProvider {
  AniwatchtvSource({required this.source});

  MSource source;

  final Client client = Client();

  @override
  bool get supportsLatest => true;

  @override
  Map<String, String> get headers => {};
  
  @override
  Future<MPages> getPopular(int page) async {
    // TODO: implement
  }

  @override
  Future<MPages> getLatestUpdates(int page) async {
    // TODO: implement
  }

  @override
  Future<MPages> search(String query, int page, FilterList filterList) async {
    // TODO: implement
  }

  @override
  Future<MManga> getDetail(String url) async {
    // TODO: implement
  }
  
  // For novel html content
  @override
  Future<String> getHtmlContent(String name, String url) async {
    // TODO: implement
  }
  
  // Clean html up for reader
  @override
  Future<String> cleanHtmlContent(String html) async {
    // TODO: implement
  }
  
  // For anime episode video list
  @override
  Future<List<MVideo>> getVideoList(String url) async {
    // TODO: implement
  }

  // For manga chapter pages
  @override
  Future<List<String>> getPageList(String url) async{
    // TODO: implement
  }

  @override
  List<dynamic> getFilterList() {
    // TODO: implement
  }

  @override
  List<dynamic> getSourcePreferences() {
    // TODO: implement
  }
}

AniwatchtvSource main(MSource source) {
  return AniwatchtvSource(source:source);
}