import '../../../../model/source.dart';
import 'src/en/mangabat/mangabat.dart';
import 'src/mangairo/mangaeiro.dart';
import 'src/en/mangakakalot/mangakakalot.dart';
import 'src/en/manganato/manganato.dart';

const mangaboxVersion = "0.0.8";
const mangaboxSourceCodeUrl =
    "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/manga/multisrc/mangabox/mangabox.dart";

List<Source> get mangaboxSourcesList => _mangaboxSourcesList;
List<Source> _mangaboxSourcesList =
    [
          //Mangabat (EN)
          mangabatSource,
          //Mangairo (EN)
          mangairoSource,
          //Mangakakalot (EN)
          mangakakalotSource,
          //Manganato (EN)
          manganatoSource,
        ]
        .map(
          (e) => e
            ..itemType = ItemType.manga
            ..sourceCodeUrl = mangaboxSourceCodeUrl
            ..version = mangaboxVersion,
        )
        .toList();
