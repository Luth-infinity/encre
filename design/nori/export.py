# Les fichiers de l'app : deux boucles WebM VP9 transparentes (4 s, 24 i/s) et le portrait.
# coin : Nori en entière, à 0,55 du dessin, recadré sur tout ce qu'il occupe pendant la boucle.
# bulle : la fenêtre de 132 px (×2) autour du rond de 96 ; le rond et l'anneau restent en CSS.
import numpy as np, cv2, os, subprocess, shutil
from PIL import Image
from anim import Corps, Bulle, T
N=96; A='../../src/renderer/src/assets'
co,bu=Corps(),Bulle()
def vp9(dossier,sortie):
    subprocess.run(['ffmpeg','-v','error','-y','-framerate','24','-i',f'{dossier}/%03d.png','-c:v','libvpx-vp9','-pix_fmt','yuva420p',
                    '-b:v','0','-crf','32','-auto-alt-ref','0','-row-mt','1',sortie],check=True)
# coin
fr=[co.frame(i/N*T) for i in range(N)]
al=np.max([f[...,3] for f in fr],axis=0)>8
ys,xs=np.where(al); m=12
x0,y0,x1,y1=xs.min()-m,ys.min()-m,xs.max()+m,ys.max()+m
E=0.55; w=int((x1-x0)*E)//2*2; h=int((y1-y0)*E)//2*2
print('coin : origine',x0,y0,'taille vidéo',w,h)
os.makedirs('ex/coin',exist_ok=True)
for i,f in enumerate(fr):
    c=np.zeros((y1-y0,x1-x0,4),np.float32); sy0,sx0=max(y0,0),max(x0,0)
    c[sy0-y0:min(y1,co.H)-y0, sx0-x0:min(x1,co.W)-x0]=f[sy0:y1,sx0:x1]
    c=cv2.resize(c,(w,h),interpolation=cv2.INTER_AREA)
    Image.fromarray(c.astype(np.uint8),'RGBA').save(f'ex/coin/{i:03d}.png')
vp9('ex/coin',f'{A}/nori-coin.webm')
# bulle
P=264; s=P/132*96/2/Bulle.CR
M=np.float32([[s,0,P/2-Bulle.CX*s],[0,s,P/2-Bulle.CY*s]])
os.makedirs('ex/bulle',exist_ok=True)
for i in range(N):
    f=cv2.warpAffine(bu.frame(i/N*T),M,(P,P),flags=cv2.INTER_AREA)
    Image.fromarray(f.astype(np.uint8),'RGBA').save(f'ex/bulle/{i:03d}.png')
vp9('ex/bulle',f'{A}/nori-bulle.webm')
# portrait : rond noir, Nori les yeux ouverts, coupé au rond
R=192; s=R/2/Bulle.CR
M=np.float32([[s,0,R/2-Bulle.CX*s],[0,s,R/2-Bulle.CY*s]])
f=cv2.warpAffine(bu.src,M,(R,R),flags=cv2.INTER_AREA); a=f[...,3:]/255.
rgb=f[...,:3]*a+np.array([11,12,14.])*(1-a)
yy,xx=np.indices((R,R)); disc=np.clip(R/2-np.hypot(xx-R/2+.5,yy-R/2+.5)+.5,0,1)
Image.fromarray(np.dstack([rgb,disc*255]).astype(np.uint8),'RGBA').save(f'{A}/nori-portrait.png')
shutil.rmtree('ex')
