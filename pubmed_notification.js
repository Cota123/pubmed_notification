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
