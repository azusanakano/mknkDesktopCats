# mknkDesktopCats 1.8.0 — ネコシステム社

今回添付された8コマPNGの2枚を使用する、Windows x64用デスクトップペットです。画像取り込みと再生の方針は `AGENTS.md` にあります。

## ソース画像と取り込み

| 猫 | 原画 | セル構成 |
| --- | --- | --- |
| ゆりちゃん | `art_source/reference/yuri_walk_sheet.png` | 1024×512 RGBA、4列×2行 |
| オニャンコポン | `art_source/reference/onyankopon_walk_sheet.png` | 1024×512 RGBA、4列×2行 |

原画は添付ファイルそのものです。`tools/import_reference.mjs` でSHA-256を照合し、各256×256セルを左上から行順に取り込みます。原画のRGBAとセル内位置を保持し、既存アルファを使用します。黒背景の推定除去、姿勢の描き直し、部位変形、中間画像の追加、コマごとの整列は行いません。添付PNGの再圧縮も行っていません。

描画時は乗算済みBGRAへ変換します。左向きはセル全体の左右反転です。初期位置・呼び戻し位置では、ゆりちゃん242px、オニャンコポン228pxの固定接地下端を基準にウィンドウを置きます。これらは256pxセル内の猫別基準で、各コマの位置を補正するものではありません。保存済みの位置は引き継ぎ、`MonitorFromRect` で配置予定位置に対応するモニターの作業領域を使います。

## 再生と描画

- `src/reference_walk.h` が2匹それぞれのF01〜F08を管理します。クリックや接近時にも別の画像へ切り替えません。
- 目標周期は、ゆっくり2400ms（300ms/コマ）、ふつう1200ms（150ms/コマ）、元気800ms（100ms/コマ）です。
- ウィンドウ位置は33msの要求タイマーで更新し、姿勢を保持している間も移動します。Windowsの実際のタイマー精度は環境に依存します。
- 移動量は表示幅256px換算で1周48pxの設定値です。原画から計測した生体の歩幅ではありません。
- タイマー遅延時はコマを飛ばしません。一時停止・非表示・ドラッグ中は現在のコマを保持します。
- 表示サイズに合わせた左右の描画キャッシュを再利用します。同じコマでは位置だけを更新し、位置も変わらなければ画像転送を省きます。

既定224px時の歩行キャッシュは `2匹×2方向×8コマ×224×224×4` = 6,422,528 bytes（6.125MiB）。元画像展開後は `2匹×8コマ×256×256×4` = 4,194,304 bytes（4MiB）です。これは各画像バッファの容量で、アプリ全体の実測メモリ使用量ではありません。

## ビルド

Linux上のGCC、GNU binutils（`ld -V`に`i386pep`）、Python 3、Node.js、Sharp 0.35.4を使います。追加のWindows SDKは不要です。

```bash
npm install
bash build.sh
bash tests/run_tests.sh
node tools/build_reference_viewer.mjs . ../preview/walk-check.html
```

`build.sh` は `CODEX_PRIMARY_RUNTIME_NODE` と `CODEX_PRIMARY_RUNTIME_NODE_MODULES` が設定されていれば利用します。ビルド出力は `dist/mknkDesktopCats.exe` です。

動画の再作成は任意です。`tools/build_preview_video.py` を使い、PythonのPillowとffmpegを追加で必要とします。配布の `preview/walk-preview.mp4` は4.8秒・960×400・30fpsの素材プレビューです。

## 検証

テスト対象は、原画のハッシュ・画素、8コマの順序とループ、3速度、停止・非表示・ドラッグ、左右の描画、位置のみの更新、猫別の初期配置、Windows x64 PEの構造です。検証結果は `tests/validation-report.json` と配布ルートの `BUILD-REPORT.txt` を参照してください。

描画テストはWindows APIスタブを使ったCコードの検証です。Windows実機での起動・操作とCPU使用率の測定はこの環境では未実施です。HTMLプレビューは素材と再生の確認用です。

## 互換性

EXE名、排他制御名、ウィンドウ識別名、設定保存先 `%APPDATA%\mknkDesktopCats\settings.ini`、自動起動値名 `mknkDesktopCats` を保持しています。ブランドはネコシステム社を継続します。同梱の小太郎・チャコさんサブパッケージは既存版のままです。
