import '../../../../../model/source.dart';

Source get royalroadSource => _royalroadSource;
const _royalroadVersion = "0.0.1";
const _royalroadSourceCodeUrl =
    "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/novel/src/en/royalroad/royalroad.dart";
const _royalroadIconUrl =
    "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/novel/src/en/royalroad/icon.png";
Source _royalroadSource = Source(
  name: "MangaPark",
  baseUrl: "https://mangapark.io",
  apiUrl: "https://mangapark.io/apo/",
  lang: "en",
  typeSource: "single",
  iconUrl: _royalroadIconUrl,
  sourceCodeUrl: _royalroadSourceCodeUrl,
  itemType: ItemType.novel,
  version: _royalroadVersion,
  dateFormat: "MMM dd yyyy",
  dateFormatLocale: "en",
);
