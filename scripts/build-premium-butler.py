"""Pack generated full-body key poses, anchor boots, interpolate raster motion.

Usage: python scripts/build-premium-butler.py <generated-sheet.png> <review-dir>
Build-only dependencies: Pillow, numpy, opencv-python-headless. No runtime dependency.
Original poses are image_gen drawings, not a rotated or cropped standing figure.
"""
import sys,json,hashlib,pathlib
import numpy as np
from PIL import Image,ImageDraw
import cv2
ROOT=pathlib.Path(__file__).resolve().parents[1]
out=ROOT/'apps/web/public/art/effects/v3'
source=Image.open(sys.argv[1]).convert('RGBA');review=pathlib.Path(sys.argv[2]);review.mkdir(parents=True,exist_ok=True)
W,H=256,448;keys=[];anchors=[]
for i in range(8):
 x0=round(i%4*source.width/4);y0=round(i//4*source.height/4)
 im=source.crop((x0,y0,round((i%4+1)*source.width/4),round((i//4+1)*source.height/4)))
 a=np.array(im);ys,xs=np.where(a[:,:,3]>180);bottom=int(ys.max());foot=xs[ys>=bottom-8];cx=int(round(float(np.median(foot))))
 dx=128-cx;dy=430-bottom;canvas=Image.new('RGBA',(W,H));canvas.alpha_composite(im,(dx,dy));keys.append(np.array(canvas));anchors.append({'sourceFrame':i,'sourceFoot':[cx,bottom],'translation':[dx,dy],'targetFoot':[128,430]})
flows=[]
for a,b in zip(keys,keys[1:]):
 def gray(v):return cv2.cvtColor((v[:,:,:3].astype(np.float32)*(v[:,:,3:4]/255)).astype(np.uint8),cv2.COLOR_RGB2GRAY)
 flows.append((cv2.calcOpticalFlowFarneback(gray(a),gray(b),None,.5,4,29,5,7,1.5,0),cv2.calcOpticalFlowFarneback(gray(b),gray(a),None,.5,4,29,5,7,1.5,0)))
grid=np.stack(np.meshgrid(np.arange(W,dtype=np.float32),np.arange(H,dtype=np.float32)),axis=-1)
def pose(p):
 i=min(6,int(p));f=p-i
 if p>=7:return Image.fromarray(keys[7])
 if f<.001:return Image.fromarray(keys[i])
 fwd,bwd=flows[i]
 a=cv2.remap(keys[i],grid[:,:,0]-fwd[:,:,0]*f,grid[:,:,1]-fwd[:,:,1]*f,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
 b=cv2.remap(keys[i+1],grid[:,:,0]-bwd[:,:,0]*(1-f),grid[:,:,1]-bwd[:,:,1]*(1-f),cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
 result=np.clip(a.astype(np.float32)*(1-f)+b.astype(np.float32)*f,0,255).astype(np.uint8)
 # The boot anchor is fixed in the source drawings. Keep it fixed through interpolation.
 result[412:]=keys[0][412:]
 return Image.fromarray(result)
frames=[]
for i in range(56):
 if i<8:p=0
 elif i<24:p=(i-8)/15*7
 elif i<36:p=7
 elif i<52:p=(1-(i-36)/15)*7
 else:p=0
 frames.append(pose(p))
sheet=Image.new('RGBA',(W*8,H*7))
for i,im in enumerate(frames):sheet.alpha_composite(im,(i%8*W,i//8*H))
sheet.save(out/'butler-bow.webp',quality=90,method=6)
preview=[]
for im in frames:
 bg=Image.new('RGBA',(W,H),'#151710');bg.alpha_composite(im);preview.append(bg.convert('RGB'))
preview[0].save(review/'butler-bow.gif',save_all=True,append_images=preview[1:],duration=60,loop=0)
contact=Image.new('RGBA',(W*4,H),'#151710')
for j,i in enumerate([0,14,23,51]):contact.alpha_composite(frames[i],(W*j,0))
contact.save(review/'butler-keyframes.png')
audit={'sourceSha256':hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest(),'method':'Eight generated full-body poses, fixed boot anchor, bidirectional optical-flow interpolation; same descent reversed for rise; not a rotated standing image','cell':[W,H],'columns':8,'rows':7,'frames':56,'sourceAnchors':anchors,'fixedBootBand':[412,448],'timing':{'voiceAt':1450,'spokenDurationMs':768,'holdStart':1400,'holdMs':868,'riseAt':2268,'durationMs':4002}}
(out/'butler-motion.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
manifest=json.loads((out/'manifest.json').read_text(encoding='utf8'));row=next(f for f in manifest['files'] if f['id']=='butler-bow');data=(out/'butler-bow.webp').read_bytes();row.update(bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),processing=audit['method'],width=W*8,height=H*7)
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'frames':len(frames),'width':W*8,'height':H*7,'bytes':len(data),'anchors':anchors}))
