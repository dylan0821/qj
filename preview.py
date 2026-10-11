"""Serve only the explicitly public frontend; private assets never leave here."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse

ROOT=Path(__file__).resolve().parent
FILES={'index.html','app.js','reader-data.js','auth.js','site-config.js','theme.js','math-config.js','style.css','logo-favicon.png','logo-flat-skeuo.png','vendor/tex-svg.js','vendor/boldsymbol.js','vendor/MathJax-LICENSE'}
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT),**kwargs)
    def send_head(self):
        name=unquote(urlsplit(self.path).path).lstrip('/') or 'index.html'
        if name not in FILES:
            self.send_error(404);return None
        return super().send_head()
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8770);args=p.parse_args()
    print('强基题库前端：http://127.0.0.1:'+str(args.port)+'/',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
