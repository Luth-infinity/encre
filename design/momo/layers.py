from PIL import Image
import numpy as np, cv2, json
a=np.array(Image.open('cut.png'))
H,W=a.shape[:2]
lab=np.load('lab.npy')
n=lab.max()+1
st=[]
ys,xs=np.indices(lab.shape)
# bbox per comp
x0=np.full(n,1e9);x1=np.zeros(n);y0=np.full(n,1e9);y1=np.zeros(n)
for i in range(1,n):
    m=lab==i
    if not m.any(): continue
    yy,xx=np.where(m); x0[i],x1[i],y0[i],y1[i]=xx.min(),xx.max(),yy.min(),yy.max()
part=np.zeros((H,W),np.int8)-1
NAMES=['queue','brasG','corps','brasD','branchiesG','branchiesD','tete']  # back -> front
P={k:i for i,k in enumerate(NAMES)}
for i in range(1,n):
    m=lab==i
    if i==9: part[m]=P['tete']
    elif i==34: part[m]=P['corps']
    elif x1[i]<1180 and y1[i]<800: part[m]=P['branchiesG']
    elif x0[i]>1600 and y1[i]<500: part[m]=P['branchiesD']
    elif x0[i]>1150 and x1[i]<1380 and y0[i]>930 and y1[i]<1200: part[m]=P['brasG']
    elif lab[m].size: part[m]=P['corps']
# split body comp: tail = left of cut line
cut=lambda y: 1440-(y-1200)*160/560
c=part==P['corps']
part[c&(xs<cut(ys))&((ys>1215)|(xs<1250))]=P['queue']
# right arm: polygon over the body
armD=np.array([[1690,800],[1830,760],[2080,860],[2080,1020],[1990,1000],[1760,935],[1700,900]],np.int32)
pm=np.zeros((H,W),np.uint8); cv2.fillPoly(pm,[armD],1)
part[(pm>0)&(part==P['corps'])]=P['brasD']
# outline pixels: front-most part within reach wins
alpha=a[...,3]>0
un=alpha&(part<0)
d={}
for k,i in P.items():
    d[i]=cv2.distanceTransform((part!=i).astype(np.uint8),cv2.DIST_L2,5)
best=np.full((H,W),1e9); asg=np.full((H,W),-1)
for i in sorted(d):  # back to front; front wins if within 16px, else nearest
    pass
dist=np.stack([d[i] for i in range(len(NAMES))])
near=dist.argmin(0)
asg=near.copy()
for i in range(len(NAMES)):  # front layers claim outline within 16px
    asg=np.where(dist[i]<16,i,asg)
part[un]=asg[un]
np.save('part.npy',part)
BODY=np.array([55,12,38,255],np.uint8)
layers={}
for k,i in P.items():
    L=np.zeros_like(a); m=part==i; L[m]=a[m]; layers[k]=L
# --- fill what's hidden behind front layers ---
head=part==P['tete']
k5=lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*r+1,2*r+1))
# body under the head (lower half, inside the head silhouette)
hb=cv2.erode(head.astype(np.uint8),k5(22))>0
layers['corps'][hb&(ys>560)]=BODY
# body under right arm: inpaint the arm region that lies over the body
bodyhull=np.zeros((H,W),np.uint8); cv2.fillPoly(bodyhull,[np.array([[1640,700],[1860,880],[1880,1100],[1700,1100],[1600,900]],np.int32)],1)
holeD=(part==P['brasD'])&(bodyhull>0)
B=layers['corps'].copy()
rgb=cv2.inpaint(np.ascontiguousarray(B[...,:3]),holeD.astype(np.uint8),9,cv2.INPAINT_TELEA)
B[holeD,:3]=rgb[holeD]; B[holeD,3]=255; layers['corps']=B
# stubs: back layers extend under front ones around their pivot
PIV={'tete':(1420,775),'branchiesG':(1110,560),'branchiesD':(1650,400),'brasG':(1355,965),'brasD':(1725,880),'queue':(1420,1460)}
def stub(name,center,r,under):
    m=np.zeros((H,W),np.uint8); cv2.circle(m,center,r,1,-1)
    m=(m>0)&under&(layers[name][...,3]==0)
    layers[name][m]=BODY
stub('queue',(1440,1450),260,part==P['corps'])
stub('brasG',(1375,1000),60,part==P['corps'])
stub('branchiesG',(1120,560),70,head)
stub('branchiesD',(1660,380),70,head)
for k,i in P.items():
    L=layers[k]; m=(L[...,3]>0).astype(np.uint8)
    for _ in range(4):
        grow=(cv2.dilate(m,np.ones((3,3),np.uint8))>0)&(m==0)&(part>i)
        if not grow.any(): break
        src=cv2.dilate(L,np.ones((3,3),np.uint8))
        L[grow]=src[grow]; L[grow,3]=255; m[grow]=1
# crop at half resolution
S=0.5; man={'w':int(W*S),'h':int(H*S),'ordre':NAMES,'calques':{}}
for k in NAMES:
    L=layers[k]; yy,xx=np.where(L[...,3]>0)
    bx0,by0,bx1,by1=xx.min(),yy.min(),xx.max()+1,yy.max()+1
    im=Image.fromarray(L[by0:by1,bx0:bx1]).resize((round((bx1-bx0)*S),round((by1-by0)*S)),Image.LANCZOS)
    im.save(f'out/{k}.png')
    px,py=PIV.get(k,(0,0))
    man['calques'][k]={'x':round(bx0*S),'y':round(by0*S),'pivot':[round(px*S),round(py*S)]}
json.dump(man,open('out/momo.json','w'),indent=1)
print(json.dumps(man))
