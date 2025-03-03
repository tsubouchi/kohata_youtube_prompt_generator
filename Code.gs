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
  // APIキーを取得
  const apiKeys = getApiKeys();
  
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
    if (apiKeys.youtubeApiKey) {
      var apiUrl = 'https://www.googleapis.com/youtube/v3/videos?part=snippet&id=' + videoId + '&key=' + apiKeys.youtubeApiKey;
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
  var prompt = generatePromptWithGemini(fileId);
  
  // 5. スプレッドシートに書き込み
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var ss = SpreadsheetApp.openById(spreadsheetId);
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
  
  // スクリプトプロパティからフォルダIDを取得
  var folderId = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  var folder = DriveApp.getFolderById(folderId);
  var file = folder.createFile(blob);
  return file.getId();
}

/**
 * Gemini 2.0 flash LLMでプロンプト生成
 * 画像ファイルIDを使用してGemini APIにリクエストを送信
 */
function generatePromptWithGemini(fileId) {
  // Driveから画像を取得
  var file = DriveApp.getFileById(fileId);
  var imageBlob = file.getBlob();
  
  // 画像をBase64エンコード
  var base64Image = Utilities.base64Encode(imageBlob.getBytes());
  
  // APIキーを取得
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  
  // Gemini APIのエンドポイント（gemini-1.5-flashモデルを使用）
  var endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey;
  
  // リクエストボディの作成
  var requestBody = {
    contents: [
      {
        parts: [
          {
            text: "この画像を詳細に分析し、Midjourneyで同様の画像を生成するためのプロンプトを作成してください。プロンプトは英語で、主要な被写体、スタイル、色調、照明、構図などの要素を含めてください。"
          },
          {
            inline_data: {
              mime_type: imageBlob.getContentType(),
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
    contentType: "application/json",
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };
  
  try {
    // APIリクエストを送信
    var response = UrlFetchApp.fetch(endpoint, options);
    var responseText = response.getContentText();
    Logger.log("Gemini API Response: " + responseText); // レスポンスの全文をログに記録
    
    var responseData = JSON.parse(responseText);
    
    // レスポンスの構造を詳細にログに記録
    Logger.log("Response structure: " + JSON.stringify(Object.keys(responseData)));
    
    // 新しいGemini APIのレスポンス形式に対応
    if (responseData.candidates && responseData.candidates.length > 0) {
      Logger.log("Candidates length: " + responseData.candidates.length);
      Logger.log("First candidate structure: " + JSON.stringify(Object.keys(responseData.candidates[0])));
      
      var content = responseData.candidates[0].content;
      if (content && content.parts && content.parts.length > 0) {
        return content.parts[0].text;
      }
    } else if (responseData.error) {
      // エラーレスポンスの場合
      Logger.log("API Error: " + JSON.stringify(responseData.error));
      return "Gemini APIエラー: " + responseData.error.message;
    }
    
    // エラーまたは予期しないレスポンス形式の場合
    Logger.log("Unexpected response format: " + JSON.stringify(responseData));
    return "APIからの応答を解析できませんでした。詳細はログを確認してください。";
  } catch (error) {
    Logger.log("Error calling Gemini API: " + error);
    return "Gemini APIの呼び出し中にエラーが発生しました: " + error.toString();
  }
}

/**
 * スクリプトプロパティからAPIキーを取得する関数
 */
function getApiKeys() {
  const scriptProperties = PropertiesService.getScriptProperties();
  return {
    youtubeApiKey: scriptProperties.getProperty('YOUTUBE_API_KEY'),
    geminiApiKey: scriptProperties.getProperty('GEMINI_API_KEY')
  };
}

/**
 * YouTube URLからサムネイルを取得する関数
 */
function getYouTubeThumbnail(videoUrl) {
  // YouTube URLからビデオIDを抽出
  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }

  const apiKey = PropertiesService.getScriptProperties().getProperty('YOUTUBE_API_KEY');
  const apiUrl = "https://www.googleapis.com/youtube/v3/videos?id=" + videoId + "&key=" + apiKey + "&part=snippet";

  try {
    const response = UrlFetchApp.fetch(apiUrl);
    const data = JSON.parse(response.getContentText());

    if (data.items && data.items.length > 0) {
      // 高解像度のサムネイルを取得
      return data.items[0].snippet.thumbnails.high.url;
    } else {
      throw new Error('Video not found');
    }
  } catch (error) {
    Logger.log('Error fetching thumbnail: ' + error);
    throw error;
  }
}

// 古い環境変数取得関数は削除または非推奨化
/**
 * .envファイルから環境変数を読み込む (非推奨)
 * @deprecated スクリプトプロパティを使用してください
 */
function getEnvironmentVariables() {
  Logger.log('警告: getEnvironmentVariables()は非推奨です。代わりにPropertiesService.getScriptProperties()を使用してください。');
  // スクリプトプロパティから値を取得して互換性を保つ
  const scriptProperties = PropertiesService.getScriptProperties();
  return {
    SPREADSHEET_ID: scriptProperties.getProperty('SPREADSHEET_ID') || '',
    FOLDER_ID: scriptProperties.getProperty('FOLDER_ID') || '',
    YOUTUBE_API_KEY: scriptProperties.getProperty('YOUTUBE_API_KEY') || '',
    GEMINI_API_KEY: scriptProperties.getProperty('GEMINI_API_KEY') || ''
  };
} 