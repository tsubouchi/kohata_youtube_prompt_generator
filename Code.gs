/**
 * メイン: doGet
 * Webアプリのエントリーポイント
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('YouTube Thumbnail & Prompt Generator');
}

/**
 * HTMLファイルをincludeする補助関数（複数ファイル分割する場合に利用）
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * クライアントから呼び出すメイン処理
 * 1. YouTube URL → 動画ID取得
 * 2. YouTube Data APIでサムネイルURL取得
 * 3. サムネイル画像をDriveに保存
 * 4. Gemini 2.0 flash (LLM)を用いたプロンプト生成
 * 5. スプレッドシートに書き込み
 */
function processYouTubeUrl(youtubeUrl) {
  // 環境変数を読み込む
  const env = getEnvironmentVariables();
  
  // 1. 動画IDを抽出
  var videoId = extractVideoId(youtubeUrl);
  if (!videoId) {
    throw new Error("YouTube URLから動画IDを取得できませんでした。");
  }
  
  // 2. YouTube Data APIで動画情報を取得 (snippet)
  var videoResponse;
  
  // Advanced ServiceとAPIキーの両方に対応
  try {
    // まずAdvanced Serviceを試す
    videoResponse = YouTube.Videos.list('snippet', { id: videoId });
  } catch (e) {
    // Advanced Serviceが使えない場合はAPIキーを使用
    if (env.YOUTUBE_API_KEY) {
      var apiUrl = 'https://www.googleapis.com/youtube/v3/videos?part=snippet&id=' + videoId + '&key=' + env.YOUTUBE_API_KEY;
      var response = UrlFetchApp.fetch(apiUrl);
      videoResponse = JSON.parse(response.getContentText());
    } else {
      throw new Error("YouTube Data APIの呼び出しに失敗しました。APIキーが設定されていません。");
    }
  }
  
  if (!videoResponse || !videoResponse.items || videoResponse.items.length === 0) {
    throw new Error("動画情報が見つかりません。videoId: " + videoId);
  }
  
  var snippet = videoResponse.items[0].snippet;
  var thumbnails = snippet.thumbnails;
  
  // サムネイルURL (maxres があればそれを使う、なければ high)
  var thumbnailUrl = thumbnails.maxres ? thumbnails.maxres.url : thumbnails.high.url;
  
  // 3. サムネイルをDriveに保存
  var fileId = saveImageToDrive(thumbnailUrl, videoId + "_thumbnail.jpg");
  
  // 4. Gemini 2.0 flash (LLM)でプロンプトを生成
  var prompt = generatePromptWithGemini(fileId, env.GEMINI_API_KEY);
  
  // 5. スプレッドシートに書き込み
  var ss = SpreadsheetApp.openById(env.SPREADSHEET_ID);
  var sheet = ss.getSheetByName("YouTubePrompts");
  sheet.appendRow([
    new Date(),       // Timestamp
    youtubeUrl,       // 入力URL
    fileId,           // Drive File ID
    prompt            // LLMで生成したプロンプト
  ]);
  
  // 6. Webアプリに返却
  return {
    videoTitle: snippet.title,
    channelTitle: snippet.channelTitle || snippet.channelName,
    fileId: fileId,
    prompt: prompt
  };
}

/**
 * YouTube URLから動画IDを抽出する簡易関数
 */
function extractVideoId(url) {
  var regExp = /(?:https?:\/\/)?(?:www\.)?youtu(?:be\.com\/watch\?v=|\.be\/)([^\s&]+)/;
  var match = url.match(regExp);
  return match ? match[1] : null;
}

/**
 * サムネイル画像をURLから取得し、Driveに保存
 */
function saveImageToDrive(imageUrl, fileName) {
  var response = UrlFetchApp.fetch(imageUrl);
  var blob = response.getBlob().setName(fileName);
  
  // 環境変数からフォルダIDを取得
  const env = getEnvironmentVariables();
  var folder = DriveApp.getFolderById(env.FOLDER_ID);
  var file = folder.createFile(blob);
  return file.getId();
}

/**
 * Gemini 2.0 flash LLMでプロンプト生成
 * 画像ファイルIDを使用してGemini APIにリクエストを送信
 */
function generatePromptWithGemini(fileId, apiKey) {
  // Driveから画像を取得
  var file = DriveApp.getFileById(fileId);
  var imageBlob = file.getBlob();
  
  // 画像をBase64エンコード
  var base64Image = Utilities.base64Encode(imageBlob.getBytes());
  
  // Gemini APIのエンドポイント
  var endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent";
  
  // リクエストボディの作成
  var requestBody = {
    contents: [
      {
        parts: [
          {
            text: "この画像を詳細に分析し、Midjourneyで同様の画像を生成するためのプロンプトを作成してください。プロンプトは英語で、主要な被写体、スタイル、色調、照明、構図などの要素を含めてください。"
          },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image
            }
          }
        ]
      }
    ]
  };
  
  // APIリクエストのオプション
  var options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };
  
  try {
    // APIリクエストを送信
    var response = UrlFetchApp.fetch(endpoint, options);
    var responseData = JSON.parse(response.getContentText());
    
    // レスポンスからプロンプトを抽出
    if (responseData && responseData.candidates && responseData.candidates.length > 0) {
      var content = responseData.candidates[0].content;
      if (content && content.parts && content.parts.length > 0) {
        return content.parts[0].text;
      }
    }
    
    // エラーまたは予期しないレスポンス形式の場合
    Logger.log("Unexpected response format: " + JSON.stringify(responseData));
    return "APIからの応答を解析できませんでした。";
  } catch (error) {
    Logger.log("Error calling Gemini API: " + error);
    return "Gemini APIの呼び出し中にエラーが発生しました: " + error.toString();
  }
}

/**
 * .envファイルから環境変数を読み込む
 */
function getEnvironmentVariables() {
  try {
    // .envファイルを取得
    var files = DriveApp.getFilesByName('.env');
    if (!files.hasNext()) {
      throw new Error('.envファイルが見つかりません。');
    }
    
    var file = files.next();
    var content = file.getBlob().getDataAsString();
    
    // 環境変数をパース
    var env = {};
    content.split('\n').forEach(function(line) {
      if (line.trim() && !line.startsWith('#')) {
        var parts = line.split('=');
        if (parts.length >= 2) {
          var key = parts[0].trim();
          var value = parts.slice(1).join('=').trim();
          // 引用符を削除
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.substring(1, value.length - 1);
          }
          env[key] = value;
        }
      }
    });
    
    return env;
  } catch (error) {
    Logger.log('環境変数の読み込みエラー: ' + error);
    // デフォルト値を返す
    return {
      SPREADSHEET_ID: '',
      FOLDER_ID: '',
      YOUTUBE_API_KEY: '',
      GEMINI_API_KEY: ''
    };
  }
} 