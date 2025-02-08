importScripts("/js/spark-md5.min.js")

onmessage = (e)=>{
    // 使用Worker分割片段并计算片段MD5
    let {file, chunkSize} = e.data;
    let hashList = [];
    const chunkHandler = async filePart => new Promise(res=>{
        let reader = new FileReader();
        let spark = new SparkMD5.ArrayBuffer();
        reader.readAsArrayBuffer(filePart);
        reader.onload = (r)=>{
            let chunk = r.target.result;
            spark.append(chunk);
            res({
                chunk: new Blob([chunk]),
                hash: spark.end()
            });
        }
    });
    let total = Math.ceil(file.size / chunkSize);
    let index= 0;
    // 依托Shit这里
    const hashLoop = async ()=>{
        while(index <= total){
            let start = index * chunkSize;
            let end = Math.min(start + chunkSize, file.size);
            let fileSlice = file.slice(start, end);
            let res = await chunkHandler(fileSlice);
            index++;
            if(index > total){
                postMessage(hashList);
                break;
            }
            hashList.push(res);
        }
    }
    hashLoop().then();
}
