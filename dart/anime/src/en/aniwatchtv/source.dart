import '../../../../../model/source.dart';

Source get aniwatchtvSource => _aniwatchtvSource;
const _aniwatchtvVersion = "0.0.2";
const _aniwatchtvSourceCodeUrl =
    "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/anime/src/en/aniwatchtv/aniwatchtv.dart";
Source _aniwatchtvSource = Source(
  name: "AniWatchTV",
  baseUrl: "https://aniwatchtv.to",
  lang: "en",
  typeSource: "single",
  iconUrl:
      "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/anime/src/en/aniwatchtv/icon.png",
  sourceCodeUrl: _aniwatchtvSourceCodeUrl,
  version: _aniwatchtvVersion,
  itemType: ItemType.anime,
);
