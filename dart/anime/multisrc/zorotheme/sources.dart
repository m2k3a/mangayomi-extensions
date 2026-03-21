import '../../../../model/source.dart';
import 'src/hianime/hianime.dart';
import 'src/kaido/kaido.dart';

const _zorothemeVersion = "0.2.15";
const _zorothemeSourceCodeUrl =
    "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/anime/multisrc/zorotheme/zorotheme.dart";

List<Source> get zorothemeSourcesList => _zorothemeSourcesList;
List<Source> _zorothemeSourcesList =
    [
          //AniWatch.to (EN)
          aniwatchSource,
          //Kaido.to (EN)
          kaidoSource,
        ]
        .map(
          (e) => e
            ..sourceCodeUrl = _zorothemeSourceCodeUrl
            ..version = _zorothemeVersion,
        )
        .toList();
