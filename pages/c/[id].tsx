import { getWorkflow } from "@/lib/common";
import Head from "next/head";
import Script from "next/script";
import { GetServerSideProps } from "next";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/router";
import NavBar from "@/components/NavBar";
import { useSession, signIn, signOut } from "next-auth/react"
import Footer from "@/components/Footer";
export const getServerSideProps = (async (context) => {

  //  CAUSED BY Comfyui trying to preview images  http://localhost:3000/c/view?filename=512x869%20(2).png&type=input&subfolder= 
  if(context.params.id == "view"){
    return { props: {workflow: {}}}
  }
  console.log("Getting workflowID", context.params.id)
  const workflow = await getWorkflow(context.params.id)
  
  return { props: { workflow } }
}) satisfies GetServerSideProps<{ workflow }>

export default function Home({ workflow }) {
  const { data: session, status } = useSession();
  function onDownload(e) {
    window.downloadObjectAsJson(window.defaultGraph, 'workflow');
  }

  const router = useRouter();
  useEffect(() => {
    const exitingFunction = () => {
      console.log("exiting...");
    };

    router.events.on("routeChangeStart", exitingFunction);

    return () => {
      console.log("unmounting component...");
      try{
       
      }catch(e){
        console.log(e)
      }
      document.querySelectorAll(".comfy-multiline-input,.comfy-modal,.comfy-settings-dialog").forEach(el => el.remove());
      router.events.off("routeChangeStart", exitingFunction);
    };
  }, []);

  async function load(w){
      window.app.clean();
      await window.app.setup();
      window.graph = window.app.graph;
      window.defaultGraph = w;
      // console.log("window.defaultGraph", window.defaultGraph, "workflow.workflow",w)
      window.app.loadGraphData(w);
  }

  useEffect(() => {
    try {
      const w = JSON.parse(workflow.workflow)
      load(w)
    } catch (error) {
      console.error(error)
    }
    
  }, [workflow]);

  return (<>
    <Head>
      <title>ComfyUI</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="ComfyICU" />
      <meta name="twitter:description" content="Imgur for sharing ComfyUI workflows" />
      <meta name="twitter:image" content={workflow.url} />
      <meta property="og:title" content="ComfyICU" />
      <meta property="og:description" content="Imgur for sharing ComfyUI workflows" />
      <meta property="og:image" content={workflow.url} />
      
    </Head>

    <NavBar session={session} status={status}  menu={(<div>
          <Link onClick={onDownload} href="#">Download Workflow</Link>
          <Link href="/" className="ml-4 blue" >Upload</Link>
        </div>)} />
    {/* <div className="relative bg-black" style={{ zIndex: 1000 }}>
      <div className="flex mx-auto container p-2 justify-between bg-black" >
        <Link href="/" className="font-semibold"><span className="blue">Comfy</span>.ICU</Link>
        <div>
          <Link onClick={onDownload} href="#">Download Workflow</Link>
          <Link href="/" className="ml-4 blue" >Upload</Link>
        </div>
      </div>
    </div> */}
    <div style={{ width: '100%', height: '100%' }}>
      <div className="litegraph">
        <canvas id="graph-canvas" tabIndex={1} style={{ touchAction: 'none' }}></canvas>
      </div>
    </div>
    <div className="py-4 relative" style={{ zIndex: 1000 }}>
      <div className="container mx-auto text-center ">
        <img src={workflow.url} className="max-w-full inline" />
      </div>
    </div>
    <Footer/>
  </>)
}