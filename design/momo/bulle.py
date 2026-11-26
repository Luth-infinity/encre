import numpy as np, cv2, sys
from PIL import Image
import warp
CADRES={'A':(1405,575,340),'B':(1415,520,450),'C':(1420,470,570)}
def bulle(f,cx,cy,r,px):
    # f: RGBA float full-res frame -> RGBA bubble at px size (ring included)
    s=px*0.5/ (r*1.22)   # leave room for ring (6px gap+3px ring at 96 scale)
    M=np.float32([[s,0,px/2-cx*s],[0,s,px/2-cy*s]])
    im=cv2.warpAffine(f,M,(px,px),flags=cv2.INTER_AREA if s<1 else cv2.INTER_LINEAR)
    a=im[...,3:]/255.
    R=r*s; yy,xx=np.indices((px,px)); d=np.hypot(xx-px/2+.5,yy-px/2+.5)
    disc=np.clip(R-d+0.5,0,1)[...,None]
    bg=np.array([11,12,14],float)
    col=(im[...,:3]*a+bg*(1-a))
    ring_r=R*(1+7.5/48); rw=R*3/48
    ring=np.clip(rw/2-np.abs(d-ring_r)+0.5,0,1)[...,None]
    out=np.zeros((px,px,4)); out[...,:3]=col*disc+np.array([183,166,245])*ring*(1-disc)
    out[...,3]=np.maximum(disc,ring)[...,0]*255
    return out.astype(np.uint8)
