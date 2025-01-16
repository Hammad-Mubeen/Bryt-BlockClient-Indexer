require('dotenv').config();
const BlockchainClient = require("bryt-sdk");
const XLSX = require('xlsx');

console.log("=========== Connecting with RPCs ===========\n");

let rpcs = [];
let JSON_RPC_NODE_URLs = [
'http://3.16.190.75:8010/rpc',
'http://3.16.190.75:8020/rpc',
'http://3.16.190.75:8030/rpc',
'http://3.16.190.75:8040/rpc'
];

async function makeRPCSClients()
{
  for (var i=0; i < JSON_RPC_NODE_URLs.length; i++)
  {
    rpcs[i] = new BlockchainClient(JSON_RPC_NODE_URLs[i],process.env.PRIVATE_KEY);
  }
}

async function findMaxDuplicateElement(arr) {
    const frequency = {};

    // Count the frequency of each element
    arr.forEach(element => {
        frequency[element] = (frequency[element] || 0) + 1;
    });

    // Find the element with the maximum frequency
    let maxCount = 0;
    let maxElement = null;
    let array = [];
    for (const [element, count] of Object.entries(frequency)) {
        if (count > maxCount) {
            maxCount = count;
            maxElement = element;
        }
        let obj = {"element" : element, "count" : count};
        array.push(obj);
    }

    return { array: array, element: maxElement, count: maxCount };
}

function sleep(ms = 500) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getBlockData(block_number,obj) {
    try {

    let results=[], results_without_false=[];
    for (var i = 0; i < rpcs.length; i++)
    {
        console.log("RPC: ",JSON_RPC_NODE_URLs[i]);
        let blockData = await rpcs[i].getBlockByBLockNumber(block_number.toString());
        console.log("block data: ", blockData);
        if(blockData.result)
        {
            results[i] = blockData.result.block_hash;
        }
        else if (blockData.error)
        {
            results[i]= false;
            if(i == 0)
            {
                obj.Port_8010 = "Nill";
            }
            else if(i == 1)
            {
                obj.Port_8020 = "Nill";
            }
            else if (i == 2)
            {
                obj.Port_8030 = "Nill";
            }
            else{
                obj.Port_8040 = "Nill";
            }
        }
    }
    
    results_without_false= results.filter(element => element !== false);
    if(results_without_false.length == 1)
    {
        let index = results.indexOf(results_without_false[0]);
        if(index == 0)
        {
            obj.Port_8010 = "majority";
        }
        else if(index == 1)
        {
            obj.Port_8020 = "majority";
        }
        else if (index == 2)
        {
            obj.Port_8030 = "majority";
        }
        else{
            obj.Port_8040 = "majority";
        }
        obj.Is_Data_Correct=true;
        return;
    }
    else if (results_without_false.length == 0){
        return;
    }
        
    const maxDuplicateElement = await findMaxDuplicateElement(results_without_false);
    let count=0;
    for (var i = 0; i < maxDuplicateElement.array.length; i++)
    {
        if(maxDuplicateElement.count == maxDuplicateElement.array[i].count)
        {
            count++;
        }
    }
    if(maxDuplicateElement.count == 1 || count > 1)
    {
        for (var i = 0; i < results.length; i++)
        {
            if(results[i] != false)
            {
                if(i== 0)
                {
                    obj.Port_8010 = "minority";
                }
                else if(i == 1)
                {
                    obj.Port_8020 = "minority";
                }
                else if (i == 2)
                {
                    obj.Port_8030 = "minority";
                }
                else{
                    obj.Port_8040 = "minority";
                }
            }
        }
    }
    else{
        obj.Is_Data_Correct=true;
        for (var i = 0; i < results.length; i++)
        {
            if(results[i] == maxDuplicateElement.element)
            {
                if(i == 0)
                {
                    obj.Port_8010 = "majority";
                }
                else if(i == 1)
                {
                    obj.Port_8020 = "majority";
                }
                else if (i == 2)
                {
                    obj.Port_8030 = "majority";
                }
                else{
                    obj.Port_8040 = "majority";
                }
            } 
            else if (results[i] != false){
                if(i == 0)
                {
                    obj.Port_8010 = "minority";
                }
                else if(i == 1)
                {
                    obj.Port_8020 = "minority";
                }
                else if (i == 2)
                {
                    obj.Port_8030 = "minority";
                }
                else{
                    obj.Port_8040 = "minority";
                }
            }
        }     
    }
    } catch (error) {
      console.log("Error : ", error);
    }
}

(async () => {
  try {

    let excelData = [];

    await makeRPCSClients();
    for (var i=3575; i<=3582; i++)
    {
        let obj = { Block_Number: i, Port_8010: "", Port_8020: "", Port_8030: "", Port_8040: "", Is_Data_Correct: false };
        await getBlockData(i, obj);
        excelData.push(obj);
    }
    console.log("excel Data of blocks : ", excelData);
    // // Create worksheet from JSON data
    // const worksheet = XLSX.utils.json_to_sheet(excelData);

    // // Create a new workbook
    // const workbook = XLSX.utils.book_new();
    // XLSX.utils.book_append_sheet(workbook, worksheet, "Block Data");

    // // Export to Excel file
    // XLSX.writeFile(workbook, "block_data_report.xlsx");
  } catch (err) {
    console.log(err.message);
  }
})();

