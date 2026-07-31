import '../../../../../model/source.dart';

Source get animesaturn => _animesaturn;
const _animesaturnVersion = "0.0.56";
const _animesaturnCodeUrl =
    "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/anime/src/it/animesaturn/animesaturn.dart";
Source _animesaturn = Source(
  name: "AnimeSaturn",
  baseUrl: "https://www.animesaturn.net",
  lang: "it",
  typeSource: "single",
  iconUrl:
      "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/anime/src/it/animesaturn/icon.png",
  sourceCodeUrl: _animesaturnCodeUrl,
  version: _animesaturnVersion,
  itemType: ItemType.anime,
);
