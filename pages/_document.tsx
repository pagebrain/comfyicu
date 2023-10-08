import { Html, Head, Main, NextScript } from 'next/document'
import Script from 'next/script'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link href="/lib/litegraph.css" rel="stylesheet" type="text/css" />
        <link href="/style.css" rel="stylesheet" type="text/css" />
      </Head>
      
      <body>
      <Script src="/lib/litegraph.core.js" strategy="beforeInteractive"/>
    {/* <Script src="/lib/litegraph.extensions.js"/> */}
    <Script type="module" strategy="beforeInteractive" id="lgloader">
      {`
        import { app } from "/scripts/app.js";
        // await app.setup();
        window.app = app;
        // window.graph = app.graph;
        console.log("LOADING APP")
      
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
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
