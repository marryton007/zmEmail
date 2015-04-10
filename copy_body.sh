#!/bin/sh

for i in $(seq 1 9);
do
	cp body_{0,$i}.txt;	
done	
