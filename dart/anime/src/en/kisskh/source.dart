import '../../../../../model/source.dart';

Source get kisskhSource => _kisskhSource;
const _kisskhVersion = "0.0.8";
const _kisskhSourceCodeUrl =
    "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/anime/src/en/kisskh/kisskh.dart";
Source _kisskhSource = Source(
  name: "KissKH",
  baseUrl: "https://kisskh.ovh",
  lang: "en",
  typeSource: "single",
  iconUrl:
      "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/anime/src/en/kisskh/icon.png",
  sourceCodeUrl: _kisskhSourceCodeUrl,
  version: _kisskhVersion,
  hasCloudflare: true,
  itemType: ItemType.anime,
);
