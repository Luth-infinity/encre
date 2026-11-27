# Détoure les dessins de Tako : la transparence vient de la version sans visage (son œil est
# rempli), les couleurs de la version avec visage. Le gris de la bulle part aussi : le rond
# noir et l'anneau d'humeur sont dessinés par l'app.
from PIL import Image
import numpy as np, cv2
def detoure(avec, sans, sortie, avecGris):
    a=np.array(Image.open(avec).convert('RGB')).astype(np.float32)
    s=np.array(Image.open(sans).convert('RGB')).astype(np.float32)
    blanc=np.linalg.norm(s-255,axis=2); gris=np.linalg.norm(s-50,axis=2)
    # le violet du corps n'est qu'à ~55 du gris : seuil serré, et le gris seulement pour la bulle
    al=np.clip((blanc-10)/30,0,1)
    if avecGris: al=np.minimum(al,np.clip((gris-8)/22,0,1))
    out=np.dstack([a,al*255]).astype(np.uint8)
    Image.fromarray(out,'RGBA').save(sortie)
    # l'œil : la plus grande zone qui diffère entre les deux versions
    diff=(np.abs(a-s).max(2)>40).astype(np.uint8)
    n,lab,st,_=cv2.connectedComponentsWithStats(diff)
    i=1+np.argmax(st[1:,cv2.CC_STAT_AREA]); x,y,w,h=st[i,:4]
    print(sortie,'œil',x,y,w,h)
    np.save(sortie.replace('.png','-oeil.npy'),(lab==i))
    Image.fromarray(np.dstack([s,al*255]).astype(np.uint8),'RGBA').save(sortie.replace('.png','-sans.png'))
detoure('dessin-visage.png','dessin-sans-visage.png','corps.png',False)
detoure('bulle-visage.png','bulle-sans-visage.png','bulle.png',True)
# le rond de la bulle : cercle ajusté sur le bord gris/blanc
s=np.array(Image.open('bulle-sans-visage.png').convert('RGB')).astype(int)
g=(np.abs(s-50).max(2)<12).astype(np.uint8)
g=cv2.morphologyEx(g,cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
cs,_=cv2.findContours(g,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
c=max(cs,key=cv2.contourArea)[:,0,:].astype(float)
w=(s[c[:,1].astype(int),np.clip(c[:,0].astype(int)-6,0,None)].min(1)>200)|(s[c[:,1].astype(int),np.clip(c[:,0].astype(int)+6,0,s.shape[1]-1)].min(1)>200)
p=c[w]; A=np.c_[2*p,np.ones(len(p))]; b=(p**2).sum(1)
cx,cy,k=np.linalg.lstsq(A,b,rcond=None)[0]; print('rond',round(cx),round(cy),round(np.sqrt(k+cx*cx+cy*cy)),len(p))
