from PIL import Image
import numpy as np, cv2
def load(f): return np.array(Image.open(f).convert('RGB').rotate(-90,expand=True)).astype(np.float32)
avec=load('bulle-face-visage.png'); sans=load('bulle-face-sans-visage.png')
H,W=avec.shape[:2]
def charmask(a):
    mx=a.max(2); mn=a.min(2)
    m=((mx>28)&~(mn>232)).astype(np.uint8)
    m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
    cs,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
    out=np.zeros_like(m); cv2.drawContours(out,[c for c in cs if cv2.contourArea(c)>3000],-1,1,-1)
    return out
m=charmask(avec)|charmask(sans)
# cercle noir
blk=(avec.max(2)<28).astype(np.uint8)
cs,_=cv2.findContours(cv2.morphologyEx(blk|m,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8)),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
c=max(cs,key=cv2.contourArea)
(cx,cy),r=cv2.minEnclosingCircle(c)
print('cercle',cx,cy,r)
alpha=cv2.GaussianBlur(m.astype(np.float32),(3,3),0)
for name,a in (('front_avec',avec),('front_sans',sans)):
    o=np.zeros((H,W,4),np.float32); o[...,:3]=a; o[...,3]=alpha*255
    Image.fromarray(o.astype(np.uint8)).save(name+'.png')
np.save('front_circle.npy',np.array([cx,cy,r]))
v=Image.new('RGBA',(W,H),(120,130,140,255)); v.alpha_composite(Image.open('front_avec.png')); v.resize((W//4,H//4)).save('front_view.png')
