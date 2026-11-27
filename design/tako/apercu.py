# Aperçu à montrer avant de brancher : Tako en entier sur fond clair et sombre, la bulle en grand et à taille réelle.
import numpy as np, cv2, os, subprocess
from anim import Corps, Bulle, T
N=96; os.makedirs('apercu/img',exist_ok=True)
co,bu=Corps(),Bulle()
def sur(f,fond):
    a=f[...,3:]/255.; return (f[...,:3]*a+np.array(fond)*(1-a))
def bulle(f,px,anneau=(183,166,245)):
    s=px/132*96/2/Bulle.CR
    M=np.float32([[s,0,px/2-Bulle.CX*s],[0,s,px/2-Bulle.CY*s]])
    im=cv2.warpAffine(f,M,(px,px),flags=cv2.INTER_AREA); a=im[...,3:]/255.
    yy,xx=np.indices((px,px)); d=np.hypot(xx-px/2+.5,yy-px/2+.5); R=Bulle.CR*s
    disc=np.clip(R-d+.5,0,1)[...,None]; ring=np.clip(R*3/96-np.abs(d-R*(1+7.5/48))+.5,0,1)[...,None]
    base=np.array([244,246,247.])*(1-disc)+np.array([11,12,14.])*disc
    base=base*(1-ring)+np.array(anneau)*ring
    return (im[...,:3]*a+base*(1-a)).astype(np.uint8)
for i in range(N):
    t=i/N*T
    f=cv2.resize(co.frame(t),(1080,928),interpolation=cv2.INTER_AREA)[60:900,90:1070]
    c=np.full((1260,1960,3),244,np.uint8)
    c[0:840,0:980]=sur(f,(244,246,247)); c[0:840,980:1960]=sur(f,(27,27,34))
    g=bu.frame(t); c[860:1240,40:420]=bulle(g,380); c[984:1116,520:652]=bulle(g,132)
    c[984:1116,720:852]=bulle(g,132,(255,170,90))
    cv2.imwrite(f'apercu/img/{i:03d}.png',c[...,::-1])
subprocess.run(['ffmpeg','-v','error','-y','-framerate','24','-i','apercu/img/%03d.png','-vf','scale=1470:-2','-c:v','libx264','-pix_fmt','yuv420p','-crf','20','tako-apercu.mp4'],check=True)
