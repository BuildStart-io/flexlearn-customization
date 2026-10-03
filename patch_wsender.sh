#!/bin/bash
sed -i 's/console.warn("WAHA QR endpoint returned", qrRes.status, sessionName);/console.warn("WAHA QR endpoint returned", qrRes.status, sessionName, await qrRes.text().catch(()=>""));/' /home/anuhas/programming/flexlearn-customization/supabase/functions/wsender-sessions-flexlearn-customization/index.ts
