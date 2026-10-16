import {get} from "@vercel/blob";
import {validId} from "../../../lib/project-files";
import {emptyModelDetails,parseModelDetails} from "../../../lib/model-details";
export const runtime="nodejs";
export async function GET(request:Request){const id=new URL(request.url).searchParams.get("project")||"";if(!validId(id))return Response.json({error:"Choose a project."},{status:400});try{const file=await get(`review-assets/model-details-${id}-v1.json`,{access:"private",useCache:false});const data=file&&file.statusCode===200?parseModelDetails(await new Response(file.stream).json(),id):emptyModelDetails(id);return Response.json(data,{headers:{"Cache-Control":"private, no-store"}});}catch{return Response.json({error:"Source regions and model details could not be loaded. Try again."},{status:503});}}
