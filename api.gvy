import groovy.json.JsonOutput
import groovy.json.StringEscapeUtils
def invoke(msg) 
{ 
	try{
        def countMax;
        def row = [];
        def array = [];
		def count = 0;
		def obj = msg.get("obj");
        if (obj == null || obj.isEmpty()) {
            msg.put("jsonRsp", "No data available.")
            return true;
        }else{
            obj.keySet().each { columns ->
                array << columns;
            }
            while (true){
                row[count] = [:];
                array.each { key ->
                    row[count][key] = obj[key]["values"][count];
                }
                count++;
                if(obj[array[0]]["values"].size() == count){
                    break;
                } 
            } 
            if (row.isEmpty()) {
                msg.put("jsonRsp", "No data available.")
                return true;
            }else{
                def json_beauty = new String(JsonOutput.prettyPrint(JsonOutput.toJson(row)).getBytes("UTF-8"));
                msg.put("jsonRsp",StringEscapeUtils.unescapeJava(json_beauty));
                return true;
            }
        }
    } catch(Exception e) {
        msg.put("error",e.toString());
        return false;
    }
}