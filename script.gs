//全体を実行する
function run() {
  let err_count = 0;

  //metaデータの読み込み
  let meta = readMeta(); 

  //ユーザー数に応じて繰り返す
  let max = meta.length;
  for (i=0; i<max; i++) {

    //メインの関数を実行
    try{
      mainFunction(meta, i, err_count);

    }catch(e){
      console.log(e.message);
      errorEmail(meta[i]);
    }
  }
}


//以下で定義する各関数を実行する
function mainFunction(meta, i, err_count){
  try{
  //metaから情報を取得
  user_id = meta[i].id;
  word = meta[i].word;
  email = meta[i].email;
  num = meta[i].num;
  stop = meta[i].stop;

  console.log(user_id, word, email, stop);

  //新しいPMIDの評価、logをobjectの配列で返す
  let log = fetchAndEvaluate(word, num ,user_id);

  //新規PMIDのデータ取得、メール送信
  fetchDataAndSendEmail(log, meta[i]);

  //ログをJSON形式で保存
  writeJson(log, user_id);
  err_count=0;

  }catch(e){
    err_count++ ;

    if (err_count<6){
    console.log('count:',err_count,'\n',e.message);
    mainFunction(meta, i, err_count);
    }else{
      console.log("Stopped due to error")
      errorEmail(meta[i]);
    }
  }
}


//metaファイルの読み込む
function readMeta() {

  //メタファイルが保存されているフォルダidを指定
  folder = '******************';
  file = 'meta.json';

  const content = DriveApp.getFolderById(folder)
  .getFilesByName(file)
  .next()
  .getBlob()
  .getDataAsString("utf-8")

  return JSON.parse(content);
}



//PubmedからPMIDを取得し、前回のPMIDと比較して新規かどうかを評価する
function fetchAndEvaluate(word, num ,user_id) {
  console.log('開始')////////////////////////////////////

  // 指定したword でPubmed検索 
  let query = Utilities.formatString('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=%s&retmax=%s&retmode=json',word,num);

  //APIに接続、JSON形式で取得、読み取り可能な形式に変換
  let response = UrlFetchApp.fetch(query).getContentText();
  let response_json=JSON.parse(response);

  pmids = response_json['esearchresult']['idlist'].slice();

  //前回のPMIDを配列で取得
  let previous_pmids = previousPmids(user_id);

  //PMIDの比較、新しい場合　1　を記録
  let evaluation = pmids.map((id) =>{
    if(previous_pmids.indexOf(parseInt(id, 10)) == -1){
      return 1;
    }else{
      return 0;
    }
  });

  //PMIDSをオブジェクトに変換
  let log = pmids.reduce((acc, value, index) => {
  return {...acc, ['pmid' + index]: value};
  }, {} );
  
  //一時オブジェクトを作成して情報を入れる（あとで結合する）
  let temp = {
    evaluation: evaluation, 
    timestmp: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'), 
    error: ""
  };

  //オブジェクトを配列に入れて結合する
  log = [log, temp];

  return log
}


//ログを読み込んで前回のPMIDを取得する
function previousPmids(user_id) {
  let date = new Date();
  date.setDate(date.getDate() - 1)

  let timestmp = Utilities.formatDate(date, 'Asia/Tokyo', 'yyyyMMdd');

  let folder = '**************************';
  let file = Utilities.formatString('%s_%s', timestmp, String(user_id));

  const content = DriveApp.getFolderById(folder)
  .getFilesByName(file)
  .next()
  .getBlob()
  .getDataAsString("utf-8")

  let previous_pmids = JSON.parse(content)[0];
  previous_pmids = Object.values(previous_pmids).map((x) => parseInt(x,10));
  
  //console.log(previous_pmids);
  return previous_pmids
}


//新規だと評価された論文のデータを取得してメールを送信する
function fetchDataAndSendEmail(log, meta) {
  let pmids = Object.values(log[0]);
  let evaluation = log[1].evaluation;

  console.log('evaluation:', evaluation);

  let data = pmids.map((id, i) => {
    if (evaluation[i] == 1){
      Utilities.sleep(0.12 * 1000)

      //pmidを用いてそれぞれの論文から情報を取得するためのurlを作成
      let url= 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id='+id;

      json = JSON.parse(UrlFetchApp.fetch(url).getContentText());

      let obj = {
        pmid: id,
        pubdate: json['result'][pmids[i]]['pubdate'],
        title: json['result'][pmids[i]]['title'],
        journal_name: json['result'][pmids[i]]['fulljournalname'],
        issn: json['result'][pmids[i]]['issn'],
        link: 'https://pubmed.ncbi.nlm.nih.gov/'+pmids[i]+'/',
      }
      return obj;
    }else{
      return {};
    }
  }); 

  let abst = pmids.map((id, i) => {
    if (evaluation[i]==1){
      Utilities.sleep(0.12 * 1000)

      let url ='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&retmode=XML&id='+id;
      let response_abst=UrlFetchApp.fetch(url).getContentText();
      let document = XmlService.parse(response_abst);
      let body = XmlService.getPrettyFormat().format(document);

      let processed = processText(body);
      let jpn = LanguageApp.translate(processed, 'en','ja');

      let obj = {
        abst: processed,
        abst_jpn: jpn
      }
      return obj
    }else{
      return {};
    }
  });

  data = data.map((each, i) => {
    data[i] = Object.assign(data[i],abst[i]);
    return data[i];
  });

  evaluation.map((val, i) => {
    if(val == 1){
      sendEmail(data[i], meta);
    }
  });
}



//メールの送信を実行する関数
function sendEmail(data, meta){

  //メールの送信設定
  subject='New paper';

//メール文面の作成
  let body = Utilities.formatString(
    'PMIDS: %s<br>Journal: %s<br>Publish date: %s<br><br>Tile:<br><b>%s</b><br><br>%s<br><br>Abstract:<br>%s<br><br>%s',
    data.pmid,
    data.journal_name,
    data.pubdate,
    data.title,
    data.link,
    data.abst,
    data.abst_jpn
    );

  address = meta.email;
  //Gmailの送信
  GmailApp.sendEmail(address,subject,body,{htmlBody:body});
  console.log(address);
}

//abstractのHTMLタグを除去して整形する
function processText(body){
    //abstrastの両端の文字位置を取得
    let start =[];
    let end =[];
    start = body.indexOf('<Abstract>')+10 ;
    end= body.indexOf('</Abstract>') ;

    //abstract の切り出し
    let raw_text = body.substring(start,end);
    let processed = raw_text.replace(/<("[^"]*"|'[^']*'|[^'">])*>/g,'').replace(/[\r\n]+/g,'');

    while( processed.indexOf("  ") >=0){
      processed = processed.replace("  ","").slice()
    }
  return processed;
}


//JSON形式でログを出力する
function writeJson(log, user_id=) {
  let timestmp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');

  var json_log = JSON.stringify(log);

  var file = Utilities.formatString('%s_%s', timestmp, String(user_id));
  let folder ="************************";

  var blob = Utilities.newBlob("", "application/json", file);
  var file = blob.setDataFromString(json_log, "UTF-8");

  DriveApp.getFolderById(folder)
  .createFile(file);

  console.log('保存完了')
}

//エラーで実行だストップした際にメール通知する
function errorEmail(meta) {
  let address = "*******************" ;
  let subject = "Error Notification";
  let body = Utilities.formatString("Stopped due to error.\n(Run: %s).", meta.id);
  GmailApp.sendEmail(address,subject,body);
}
