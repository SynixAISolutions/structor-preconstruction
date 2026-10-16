"use client";
import {useEffect,useState} from "react";
import {emptyModelDetails,parseModelDetails,type ModelDetails} from "./model-details";
export function useModelDetails(projectId:string){
  const [result,setResult]=useState<{id:string;data:ModelDetails;error:string}>({id:"",data:emptyModelDetails(projectId),error:""});
  useEffect(()=>{let live=true;fetch(`/api/model-details?project=${encodeURIComponent(projectId)}`).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error||"Model details could not be loaded.");return parseModelDetails(b,projectId);}).then(data=>{if(live)setResult({id:projectId,data,error:""});},e=>{if(live)setResult({id:projectId,data:emptyModelDetails(projectId),error:e.message});});return()=>{live=false;};},[projectId]);
  return result.id===projectId?result:{data:emptyModelDetails(projectId),error:""};
}
