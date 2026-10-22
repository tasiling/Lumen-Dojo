"use client";
import { useState, type ReactNode } from "react";
/** Help disclosure is UI-only: the controlled input remains mounted and untouched. */
export default function PracticeField({id,label,help,children,group=false}:{id:string;label:string;help:string;children:ReactNode;group?:boolean}) {
  const [open,setOpen]=useState(false);
  return <div className="practice-field">
    <div className="practice-field-heading">{group ? <span className="practice-field-label">{label}</span> : <label htmlFor={id}>{label}</label>}<button className="practice-help-toggle" type="button" aria-label={`${label}的填寫說明`} aria-expanded={open} aria-controls={`${id}-help`} onClick={()=>setOpen(v=>!v)}><span aria-hidden="true">?</span></button></div>
    {children}<p className="practice-field-hint" id={`${id}-help`} hidden={!open}>{help}</p>
  </div>;
}
