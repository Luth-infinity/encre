from PIL import Image, ImageDraw
import numpy as np, cv2
a=np.array(Image.open('src.png').convert('RGB')).astype(float)
R,G,B=a[...,0],a[...,1],a[...,2]
white=((G>225)&(R>225)&(B>225)).astype(np.uint8)
n,lab=cv2.connectedComponents(white)
border=set(lab[0])|set(lab[-1])|set(lab[:,0])|set(lab[:,-1])
ext=np.isin(lab,[l for l in border if white[lab==l].any()] if False else list(border))&(white>0)
inside=(~ext).astype(np.uint8)
n2,lab2,st,_=cv2.connectedComponentsWithStats(inside)
big=[i for i in range(1,n2) if st[i,4]>2000]
keep=np.isin(lab2,big).astype(np.uint8)
k=np.ones((3,3),np.uint8)
dil=cv2.dilate(keep,k,iterations=3)>0
ero=cv2.erode(keep,k,iterations=2)>0
ring=dil&~ero
alpha=keep.astype(float)
al=np.clip((250-G)/235,0,1)
alpha[ring]=al[ring]; alpha[~dil]=0
c=a.copy(); m=ring&(alpha>0.05)
for j in range(3):
    ch=c[...,j]; ch[m]=np.clip((ch[m]-(1-alpha[m])*250)/alpha[m],0,255)
out=np.zeros(a.shape[:2]+(4,),np.uint8); out[...,:3]=c; out[...,3]=(alpha*255).astype(np.uint8)
Image.fromarray(out).save('cut.png')
ys,xs=np.where(alpha>0); print('bbox',xs.min(),ys.min(),xs.max(),ys.max(), 'comps',len(big))
