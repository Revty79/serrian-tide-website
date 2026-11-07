"""Inspect actual downloaded output. No DB, network, user environment or writes outside the owned receipt."""
import argparse, json, hashlib, struct, base64, xml.etree.ElementTree as ET
from pathlib import Path
import pymupdf
from pypdf import PdfReader

parser=argparse.ArgumentParser()
parser.add_argument("receipt",type=Path)
args=parser.parse_args()
root=args.receipt.resolve()
assert root.name.startswith("exports-s8-") and root.parent.name=="artifacts"
outputs=root/"outputs"
renders=root/"pdf-renders"
renders.mkdir(exist_ok=True)
records=[]
images=[]
for file in sorted(outputs.glob("*.png")):
    raw=file.read_bytes()
    assert raw[:8]==b"\x89PNG\r\n\x1a\n"
    offset=8
    source=None
    while offset+12<=len(raw):
        length=struct.unpack_from(">I",raw,offset)[0]
        kind=raw[offset+4:offset+8]
        payload=raw[offset+8:offset+8+length]
        if kind==b"iTXt" and payload.startswith(b"Atlas source\0\0\0\0\0"):
            source=json.loads(payload[17:])
        offset+=length+12
    assert source and source["schema"]=="serrian-atlas-output"
    pix=pymupdf.Pixmap(str(file))
    assert pix.width==source["requestedMapPixels"]["width"]
    assert pix.height>=source["requestedMapPixels"]["height"]
    assert len(set(pix.samples))>25
    if file.name=="town-crop-artwork.png":
        assert pix.alpha and min(pix.samples[pix.n-1::pix.n])==0
    images.append({"file":file.name,"width":pix.width,"height":pix.height,"sourceSha256":source["sourceSha256"],"bounds":source["bounds"]})
for file in outputs.glob("*.svg"):
    tree=ET.fromstring(file.read_bytes())
    embedded=tree.find("{http://www.w3.org/2000/svg}image")
    assert embedded is not None and embedded.attrib["href"].startswith("data:image/png;base64,")
    decoded=base64.b64decode(embedded.attrib["href"].split(",",1)[1],validate=True)
    assert decoded[:8]==b"\x89PNG\r\n\x1a\n"
    for element in tree.iter():
        assert element.tag not in ["{http://www.w3.org/2000/svg}script","{http://www.w3.org/2000/svg}foreignObject"]
        assert not any(key.lower().startswith("on") for key in element.attrib)
        if "href" in element.attrib:
            assert element.attrib["href"].startswith("data:image/png;base64,")
for file in sorted(outputs.glob("*.pdf")):
    pdf=PdfReader(str(file))
    source=json.loads(pdf.metadata.subject)
    paper=source["print"]["paper"]
    assert 1<=len(pdf.pages)<=24
    for page in pdf.pages:
        assert abs(float(page.mediabox.width)-paper["width"]*72/25.4)<.0001
        assert abs(float(page.mediabox.height)-paper["height"]*72/25.4)<.0001
    assert source["schema"]=="serrian-atlas-output"
    assert source["bounds"]["width"]>0 and source["bounds"]["height"]>0
    for plan in source["print"].get("pages",[]):
        assert abs(plan["sourceBounds"]["width"]*1000/source["print"]["scale"]-plan["mapMm"]["width"])<1e-7
        assert abs(plan["sourceBounds"]["height"]*1000/source["print"]["scale"]-plan["mapMm"]["height"])<1e-7
    document=pymupdf.open(str(file))
    for i in range(len(document)):
        pix=document[i].get_pixmap(matrix=pymupdf.Matrix(96/72,96/72),alpha=False)
        assert len(set(pix.samples))>25
        pix.save(str(renders/(file.stem+f"-page-{i+1}.png")))
    if "calibration" in file.name:
        assert source["print"]["scale"]==100 and source["bounds"]["width"]==10
        plan=source["print"]["pages"][0]
        assert plan["mapMm"]["width"]==100 and plan["mapMm"]["height"]==80
        # Independent PDF renderer: each authored 1m grid interval must occupy
        # 10mm on actual paper, including the renderer/embedding transforms.
        pix=document[0].get_pixmap(matrix=pymupdf.Matrix(300/72,300/72),alpha=False)
        def luminance(x,y):
            c=pix.pixel(int(x),int(y))
            return sum(c[:3])/3
        mm=300/25.4
        top=plan["mapMm"]["y"]
        left=plan["mapMm"]["x"]
        observed=[]
        for i in range(1,10):
            x=(left+i*10)*mm
            y=(top+23.7)*mm
            samples=[(luminance(round(x)+d,round(y)),round(x)+d) for d in range(-3,4)]
            value,position=min(samples)
            reference=luminance(round(x+1.5*mm),round(y))
            assert value<reference-10,(file.name,i,value,reference)
            observed.append(position)
        assert abs((observed[-1]-observed[0])/mm-80)<.3
    records.append({"file":file.name,"pages":len(pdf.pages),"paperMm":paper,"scale":source["print"]["scale"],"posterColumns":source["print"]["columns"],"posterRows":source["print"]["rows"],"sourceSha256":source["sourceSha256"],"bytes":file.stat().st_size,"sha256":hashlib.sha256(file.read_bytes()).hexdigest()})
assert len(records)>=8,"All seven family PDFs and deliberate poster output are required"
(root/"pdf-inspection.json").write_text(json.dumps({"passed":True,"records":records,"images":images,"everyPageRendered":True,"independentPhysicalCalibration":any("calibration" in r["file"] for r in records),"visualReviewSeparate":True},indent=2),encoding="utf-8")
print(json.dumps({"passed":True,"files":len(records),"pages":sum(r["pages"] for r in records)}))
