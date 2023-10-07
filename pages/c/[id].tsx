import { getWorkflow } from "@/lib/common";
import Head from "next/head";
import Script from "next/script";
import { GetServerSideProps } from "next";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/router";

export const getServerSideProps = (async (context) => {
  const workflow = await getWorkflow(context.params.id)
  return { props: { workflow } }
}) satisfies GetServerSideProps<{ workflow }>

export default function Home({ workflow }) {
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
      document.querySelectorAll(".comfy-multiline-input,.comfy-modal,.comfy-settings-dialog").forEach(el => el.remove());
      router.events.off("routeChangeStart", exitingFunction);
    };
  }, []);

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
    <Script src="/lib/litegraph.core.js" />
    {/* <Script src="/lib/litegraph.extensions.js"/> */}
    <Script type="module" id="inlinescript">
      {`
        window.defaultGraph = ${workflow.workflow}
        import { app } from "/scripts/app.js";
        await app.setup();
        window.app = app;
        window.graph = app.graph;
        window.app.loadGraphData(window.defaultGraph);

        // Lifted from https://stackoverflow.com/questions/19721439/download-json-object-as-a-file-from-browser
        window.downloadObjectAsJson = function(exportObj, exportName){
            var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj));
            var downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", exportName + ".json");
            document.body.appendChild(downloadAnchorNode); // required for firefox
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
          } 
        `}
    </Script>
    <div className="relative bg-black" style={{ zIndex: 1000 }}>
      <div className="flex mx-auto container p-2 justify-between bg-black" >
        <Link href="/" className="font-semibold"><span className="blue">Comfy</span>.ICU</Link>
        <div>
          <Link onClick={onDownload} href="#">Download Workflow</Link>

          <Link href="/" className="ml-4 blue" >Upload</Link>
        </div>
      </div>
    </div>
    <div style={{ width: '100%', height: '100%' }}>
      <div className="litegraph">
        <canvas id="graph-canvas" tabindex={'1'} style={{ touchAction: 'none' }}></canvas>
      </div>
    </div>
    <div className="py-4 relative bg-black" style={{ zIndex: 1000 }}>
      <div className="container mx-auto text-center ">
        <img src={workflow.url} className="max-w-full inline" />
      </div>
    </div>
  </>)
}