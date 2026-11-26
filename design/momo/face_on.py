import numpy as np, cv2
from PIL import Image
cut=np.array(Image.open('cut.png')).astype(np.float32)     # sans visage
cut1=np.array(Image.open('cut1.png')).astype(np.float32)   # avec visage
part=np.load('part.npy'); flab=np.load('facelab.npy')
H,W=cut.shape[:2]
CX,CY,AX,AY,ANG=1406,531,633/2,480/2,-23.24   # tête : centre, demi-axes, inclinaison
def rot(im,deg,c=(CX,CY)):
    M=cv2.getRotationMatrix2D(c,deg,1); return cv2.warpAffine(im,M,(W,H),flags=cv2.INTER_LINEAR)
def lvl(im): return rot(im,ANG)
def mask_ell(extra):
    m=np.zeros((H,W),np.uint8); cv2.ellipse(m,((CX,CY),(2*AX+extra,2*AY+extra),0),1,-1); return m>0
def take(im,m): o=np.zeros_like(im); o[m]=im[m]; return o
def over(dst,src):
    a=src[...,3:]/255.; dst[...,:3]=src[...,:3]*a+dst[...,:3]*(1-a); dst[...,3:]=np.maximum(dst[...,3:],src[...,3:]); return dst
RG=float(__import__('sys').argv[2]) if len(__import__('sys').argv)>2 else 18
SIGN=float(__import__('sys').argv[1]) if len(__import__('sys').argv)>1 else 1
ANG*=SIGN
tete=take(lvl(cut),mask_ell(26))
# visage : yeux, bouche, joues remis droits puis recentrés sur la tête
fm=cv2.dilate(np.isin(flab,[1,2,3,4,5]).astype(np.uint8),np.ones((5,5),np.uint8))>0
vis=lvl(take(cut1,fm))
ys,xs=np.where(vis[...,3]>20); fx=(xs.min()+xs.max())/2; fy=(ys.min()+ys.max())/2
M=np.float32([[1,0,CX-fx],[0,1,CY+15-fy]]); vis=cv2.warpAffine(vis,M,(W,H))
# branchies : le bouquet de droite, remis droit, et son miroir à gauche
br=lvl(take(cut1,part==5))
br=rot(br,RG,(CX+AX-30,CY+10))
brG=br[:,::-1].copy(); M=np.float32([[1,0,2*CX-W],[0,1,0]]); brG=cv2.warpAffine(brG,M,(W,H))
out=np.zeros_like(cut)
# buste de face : corps, ventre, contour aux couleurs du dessin
corps=np.zeros_like(cut)
BX,BY,BA,BB=CX,CY+430,290,330
cv2.ellipse(corps,((BX,BY),(2*BA,2*BB),0),(55,12,38,255),-1,cv2.LINE_AA)
cv2.ellipse(corps,((BX,BY+40),(2*BA*0.55,2*BB*0.85),0),(72,16,48,255),-1,cv2.LINE_AA)
cv2.ellipse(corps,((BX,BY),(2*BA,2*BB),0),(200,0,120,255),11,cv2.LINE_AA)
out=over(out,corps)
for l in (br,brG,tete,vis): out=over(out,l)
Image.fromarray(out.astype(np.uint8)).save('face_on.png')
v=Image.new('RGBA',(W,H),(11,12,14,255)); v.alpha_composite(Image.fromarray(out.astype(np.uint8)))
v.crop((700,0,2100,1100)).resize((700,550)).save('face_on_view.png')
